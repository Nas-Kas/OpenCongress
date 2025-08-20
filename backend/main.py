from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx, os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("CONGRESS_API_KEY")  # keep your existing .env var
BASE_URL = os.getenv("BASE_URL", "https://api.congress.gov/v3")


# ---------- helpers ----------

async def _get_json(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        r = await client.get(url, params=params or {})
        # surface useful 4xx/5xx info
        if r.status_code == 404:
            raise HTTPException(404, "Not found")
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
            # include a snippet of the body to help debugging
            body = (r.text or "")[:300]
            raise HTTPException(r.status_code, f"{e} :: {body}")
        return r.json()


def _pick_vote_block(payload: dict) -> dict:
    """
    Congress API has shipped two shapes:
      - 'houseRollCallMemberVotes': [ { ... 'results': [...] } ]
      - 'houseRollCallVoteMemberVotes': { ... 'results': [...] }
    This normalizes to a single dict with keys like legislationType, legislationNumber, results, etc.
    """
    if "houseRollCallMemberVotes" in payload:
        arr = payload.get("houseRollCallMemberVotes") or []
        return (arr[0] or {}) if arr else {}
    if "houseRollCallVoteMemberVotes" in payload:
        return payload.get("houseRollCallVoteMemberVotes") or {}
    return {}


def _flatten_member_rows(results: list[dict]) -> list[dict]:
    rows = []
    for m in results or []:
        first = (m.get("firstName") or "").strip()
        last = (m.get("lastName") or "").strip()
        rows.append({
            "bioguideId": m.get("bioguideID"),
            "name": f"{first} {last}".strip(),
            "state": m.get("voteState"),
            "party": m.get("voteParty"),
            "position": m.get("voteCast"),
        })
    return rows


def _count_positions(rows: list[dict]) -> dict:
    def is_pos(val: str, *targets: str) -> bool:
        v = (val or "").strip().lower()
        return v in {t.lower() for t in targets}
    return {
        "total": len(rows),
        "yea": sum(1 for r in rows if is_pos(r["position"], "yea")),
        "nay": sum(1 for r in rows if is_pos(r["position"], "nay")),
        "present": sum(1 for r in rows if is_pos(r["position"], "present")),
        "notVoting": sum(1 for r in rows if is_pos(r["position"], "not voting", "notvoting")),
    }


# -----------------------------
# HOUSE-ONLY: roll-call votes
# -----------------------------

@app.get("/house/votes")
async def list_house_votes(
    congress: int = Query(..., description="e.g., 119"),
    session: int | None = Query(None, description="e.g., 1 or 2"),
    limit: int = 50,
    offset: int = 0,
):
    """
    Returns a compact list of recent House roll-call votes for a Congress (optionally a session).
    Drives the dropdown in the UI.
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    path = f"/house-vote/{congress}" + (f"/{session}" if session else "")
    url = f"{BASE_URL}{path}"
    params = {"api_key": API_KEY, "limit": limit, "offset": offset}

    data = await _get_json(url, params)

    votes = []
    for block in data.get("houseRollCallVotes", []) or []:
        votes.append({
            "congress": block.get("congress"),
            "session": block.get("sessionNumber"),
            "roll": block.get("rollCallNumber"),
            "question": block.get("voteQuestion"),
            "result": block.get("result"),
            "started": block.get("startDate"),
            "legislationType": block.get("legislationType"),     # e.g., HR/HRES/HJRES/HCONRES
            "legislationNumber": block.get("legislationNumber"), # e.g., "30"
            "source": block.get("sourceDataURL"),
        })
    return votes


@app.get("/house/vote-members")
async def house_vote_members(
    congress: int = Query(...),
    session: int = Query(...),
    roll: int = Query(...),
):
    """
    Returns the per-member ballots for a given House roll call.
    (Hardened to accept either vote payload shape.)
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members"
    params = {"api_key": API_KEY}

    data = await _get_json(url, params)
    block = _pick_vote_block(data)
    if not block:
        raise HTTPException(502, f"Unexpected vote payload keys: {list(data.keys())}")

    rows = _flatten_member_rows(block.get("results") or [])
    counts = _count_positions(rows)

    return {
        "meta": {
            "congress": congress,
            "session": session,
            "roll": roll,
            "legislationType": block.get("legislationType"),
            "legislationNumber": block.get("legislationNumber"),
            "result": block.get("result"),
            "question": block.get("voteQuestion"),
            "source": block.get("sourceDataURL"),
            "legislationUrl": block.get("legislationUrl"),
        },
        "counts": counts,
        "votes": rows,
    }


@app.get("/house/vote-detail")
async def house_vote_detail(
    congress: int = Query(...),
    session: int = Query(...),
    roll: int = Query(...),
):
    """
    End-to-end: fetch member ballots, extract bill identifiers, fetch bill details,
    and return everything the UI needs in one shot.
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    # 1) Vote members
    vote_url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members"
    vote_payload = await _get_json(vote_url, {"api_key": API_KEY})
    block = _pick_vote_block(vote_payload)
    if not block:
        raise HTTPException(502, f"Unexpected vote payload keys: {list(vote_payload.keys())}")

    # 2) Extract bill identifiers
    bill_type = ((block.get("legislationType") or "").lower()).strip()
    bill_number = str(block.get("legislationNumber") or "").strip()
    bill_congress = block.get("congress") or congress

    if not bill_type or not bill_number:
        # Not all votes map to a bill (rare); return vote info only
        rows = _flatten_member_rows(block.get("results") or [])
        return {
            "meta": {
                "congress": congress,
                "session": session,
                "roll": roll,
                "question": block.get("voteQuestion"),
                "result": block.get("result"),
                "source": block.get("sourceDataURL"),
                "legislationType": block.get("legislationType"),
                "legislationNumber": block.get("legislationNumber"),
                "legislationUrl": block.get("legislationUrl"),
            },
            "counts": _count_positions(rows),
            "votes": rows,
            "bill": None,
        }

    # 3) Fetch bill details (+ a couple useful subresources)
    bill_base = f"{BASE_URL}/bill/{bill_congress}/{bill_type}/{bill_number}"
    params = {"api_key": API_KEY}

    bill_json      = await _get_json(f"{bill_base}", params)
    titles_json    = await _get_json(f"{bill_base}/titles", params)
    summaries_json = await _get_json(f"{bill_base}/summaries", params)
    actions_json   = await _get_json(f"{bill_base}/actions", params)
    texts_json     = await _get_json(f"{bill_base}/text", params)

    # compose response
    rows = _flatten_member_rows(block.get("results") or [])
    counts = _count_positions(rows)

    # pick latest summary if present
    summaries = (summaries_json.get("summaries") or [])
    latest_summary = None
    if summaries:
        summaries_sorted = sorted(summaries, key=lambda s: s.get("dateIssued", ""))
        latest_summary = summaries_sorted[-1] if summaries_sorted else None

    # extract text version links (pdf/html)
    text_versions = []
    for tv in (texts_json.get("textVersions") or []):
        link = None
        for f in (tv.get("formats") or []):
            if f.get("type") in ("PDF", "HTML") and f.get("url"):
                link = f["url"]
                break
        text_versions.append({
            "type": tv.get("type"),
            "url": link,
        })

    bill_obj = bill_json.get("bill") or {}
    bill_payload = {
        "congress": bill_congress,
        "billType": bill_type,
        "billNumber": bill_number,
        "title": bill_obj.get("title"),
        "introducedDate": bill_obj.get("introducedDate"),
        "latestAction": bill_obj.get("latestAction"),
        "titles": titles_json.get("billTitles"),
        "latestSummary": latest_summary,
        "textVersions": text_versions,
        "publicUrl": block.get("legislationUrl"),  # human-facing page from the vote payload
    }

    return {
        "meta": {
            "congress": congress,
            "session": session,
            "roll": roll,
            "question": block.get("voteQuestion"),
            "result": block.get("result"),
            "source": block.get("sourceDataURL"),
            "legislationType": block.get("legislationType"),
            "legislationNumber": block.get("legislationNumber"),
            "legislationUrl": block.get("legislationUrl"),
        },
        "counts": counts,
        "votes": rows,
        "bill": bill_payload,
    }
