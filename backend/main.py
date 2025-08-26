# main.py
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx, os, asyncio
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

app = FastAPI()

# Allow both localhost + 127.0.0.1 in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
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
        if r.status_code == 404:
            raise HTTPException(404, "Not found")
        try:
            r.raise_for_status()
        except httpx.HTTPStatusError as e:
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
        mv = payload.get("houseRollCallMemberVotes")
        if isinstance(mv, list) and mv:
            return mv[0] or {}
        if isinstance(mv, dict):
            return mv
    if "houseRollCallVoteMemberVotes" in payload:
        vv = payload.get("houseRollCallVoteMemberVotes")
        if isinstance(vv, dict):
            return vv
    return {}


def _normalize_position(pos: Optional[str]) -> str:
    t = (pos or "").strip().lower()
    if t in ("yea", "yes", "aye", "y"):
        return "Yea"
    if t in ("nay", "no", "n"):
        return "Nay"
    if t == "present":
        return "Present"
    if t in ("not voting", "notvoting", "nv", "n/v", "absent"):
        return "Not Voting"
    return (pos or "").strip() or "—"


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
            "position": _normalize_position(m.get("voteCast")),
        })
    return rows


def _count_positions(rows: list[dict]) -> dict:
    return {
        "total": len(rows),
        "yea": sum(1 for r in rows if r["position"] == "Yea"),
        "nay": sum(1 for r in rows if r["position"] == "Nay"),
        "present": sum(1 for r in rows if r["position"] == "Present"),
        "notVoting": sum(1 for r in rows if r["position"] == "Not Voting"),
    }


async def _fetch_vote_question(client: httpx.AsyncClient, congress: int, session: int, roll: int, api_key: str) -> Optional[str]:
    """Backfill voteQuestion from the members endpoint, handling both payload shapes."""
    url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members"
    try:
        r = await client.get(url, params={"api_key": api_key}, timeout=25)
        r.raise_for_status()
        block = _pick_vote_block(r.json())
        q = block.get("voteQuestion")
        return q or None
    except Exception:
        return None


# -----------------------------
# HOUSE-ONLY: roll-call votes
# -----------------------------

@app.get("/house/votes")
async def list_house_votes(
    congress: int = Query(..., description="e.g., 119"),
    session: int | None = Query(None, description="e.g., 1 or 2"),
    limit: int = 50,
    offset: int = 0,
    include_titles: bool = Query(True, description="Fetch bill titles (slower)"),
    include_questions: bool = Query(True, description="Backfill missing voteQuestion from members endpoint"),
):
    """
    Returns a compact list of recent House roll-call votes for a Congress (optionally a session).
    Drives the dropdown in the UI. Includes both 'question' and 'title' with sensible fallbacks.
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    path = f"/house-vote/{congress}" + (f"/{session}" if session else "")
    url = f"{BASE_URL}{path}"
    params = {"api_key": API_KEY, "limit": limit, "offset": offset}

    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        r = await client.get(url, params=params)
        if r.status_code == 404:
            return []
        r.raise_for_status()
        data = r.json()

        votes = []
        for block in data.get("houseRollCallVotes", []) or []:
            votes.append({
                "congress": block.get("congress"),
                "session": block.get("sessionNumber"),
                "roll": block.get("rollCallNumber"),
                "question": block.get("voteQuestion"),           # may be None; backfilled below
                "result": block.get("result"),
                "started": block.get("startDate"),
                "legislationType": block.get("legislationType"),     # e.g., HR/HRES/HJRES/HCONRES
                "legislationNumber": block.get("legislationNumber"), # e.g., "30"
                "source": block.get("sourceDataURL"),
                "title": None,  # filled below if include_titles
            })

        # Backfill missing questions by calling the members endpoint for just those rolls
        if include_questions:
            missing = [v for v in votes if not v.get("question") and v.get("session")]
            if missing:
                qs = await asyncio.gather(*[
                    _fetch_vote_question(client, v["congress"], v["session"], v["roll"], API_KEY)
                    for v in missing
                ])
                for v, q in zip(missing, qs):
                    if q:
                        v["question"] = q

        # Optionally enrich with bill titles (parallel fetch)
        if include_titles and votes:
            async def fetch_title(v) -> Optional[str]:
                t, n = v.get("legislationType"), v.get("legislationNumber")
                if not (t and n):
                    return None
                bill_url = f"{BASE_URL}/bill/{congress}/{t.lower()}/{n}"
                try:
                    resp = await client.get(bill_url, params={"api_key": API_KEY}, timeout=25)
                    resp.raise_for_status()
                    return (resp.json().get("bill") or {}).get("title")
                except Exception:
                    return None

            titles = await asyncio.gather(*(fetch_title(v) for v in votes))
            for v, title in zip(votes, titles):
                v["title"] = title

    return votes


@app.get("/house/vote-members")
async def house_vote_members(
    congress: int = Query(...),
    session: int = Query(...),
    roll: int = Query(...),
):
    """
    Returns the per-member ballots for a given House roll call.
    (Hardened to accept either vote payload shape; normalizes Aye/No -> Yea/Nay, etc.)
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

    # Flatten & counts once
    rows = _flatten_member_rows(block.get("results") or [])
    counts = _count_positions(rows)

    if not bill_type or not bill_number:
        # Not all votes map to a bill (rare); return vote info only
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
            "bill": None,
        }

    # 3) Fetch bill details (+ a couple useful subresources)
    bill_base = f"{BASE_URL}/bill/{bill_congress}/{bill_type}/{bill_number}"
    params = {"api_key": API_KEY}

    # Best-effort: fetch subresources; tolerate missing ones
    async def safe_get(url):
        try:
            return await _get_json(url, params)
        except HTTPException as e:
            # Swallow 404s for subresources to avoid failing the whole endpoint
            if e.status_code == 404:
                return {}
            raise

    bill_json      = await safe_get(f"{bill_base}")
    titles_json    = await safe_get(f"{bill_base}/titles")
    summaries_json = await safe_get(f"{bill_base}/summaries")
    actions_json   = await safe_get(f"{bill_base}/actions")
    texts_json     = await safe_get(f"{bill_base}/text")

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
        "actions": actions_json.get("actions"),    # useful if you want actionCode on the frontend
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


# --- MEMBER DETAIL -----------------------------------------------------------
@app.get("/member/{bioguideId}")
async def get_member_detail(bioguideId: str):
    """
    Basic member profile from Congress.gov, with a friendly shape.
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    url = f"{BASE_URL}/member/{bioguideId}"
    params = {"api_key": API_KEY}
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        r = await client.get(url, params=params)
        if r.status_code == 404:
            raise HTTPException(404, "Member not found")
        r.raise_for_status()
        data = r.json()

    m = (data.get("member") or data.get("data", {}).get("member")) or {}
    # Normalize a little
    name = m.get("name") or f"{m.get('firstName','')} {m.get('lastName','')}".strip()
    party = m.get("partyName") or m.get("party")
    state = m.get("state")
    depiction = (m.get("depiction") or {}) if isinstance(m.get("depiction"), dict) else {}
    imageUrl = depiction.get("imageUrl")

    return {
        "bioguideId": bioguideId.upper(),
        "name": name,
        "party": party,
        "state": state,
        "imageUrl": imageUrl,
        "raw": m,  # keep for future use if you want more fields
    }


# --- MEMBER HOUSE VOTES (AGGREGATED) ----------------------------------------
@app.get("/member/{bioguideId}/house-votes")
async def get_member_house_votes(
    bioguideId: str,
    congress: int = Query(..., description="e.g., 119 or 118"),
    session: int = Query(1, description="1 or 2"),
    window: int = Query(150, ge=1, le=500, description="how many recent roll calls to scan"),
    offset: int = 0,
):
    """
    Scan recent House roll calls and collect this member's ballots.
    Parallelized with bounded concurrency, resilient to slow/404 rolls,
    and enriched with vote questions + bill titles.
    """
    if not API_KEY:
        raise HTTPException(500, "Missing Congress API key")

    bioguideId = bioguideId.upper()

    # 1) list a window of recent votes
    list_url = f"{BASE_URL}/house-vote/{congress}/{session}"
    params = {"api_key": API_KEY, "limit": window, "offset": offset}
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        lr = await client.get(list_url, params=params)
        lr.raise_for_status()
        ldata = lr.json()

    roll_blocks = (ldata.get("houseRollCallVotes") or [])[:window]

    # Quick exit if nothing to do
    if not roll_blocks:
        profile = await get_member_detail(bioguideId)
        return {
            "profile": profile,
            "congress": congress,
            "session": session,
            "window": window,
            "stats": {"total": 0, "yea": 0, "nay": 0, "present": 0, "notVoting": 0},
            "votes": [],
        }

    # 2) fetch member votes in parallel with bounded concurrency
    sem = asyncio.Semaphore(8)   # tune: 6–10 is usually safe
    timeout = httpx.Timeout(connect=10.0, read=15.0, write=10.0, pool=10.0)

    async def fetch_roll_for_member(rb: dict):
        roll = rb.get("rollCallNumber")
        if roll is None:
            return None

        bill_type = rb.get("legislationType")
        bill_number = rb.get("legislationNumber")

        members_url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members"

        async with sem:
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    r = await client.get(members_url, params={"api_key": API_KEY})
                    if r.status_code == 404:
                        return None
                    r.raise_for_status()
                    mdata = r.json()
            except (httpx.HTTPError, Exception):
                # skip any problematic roll instead of failing the whole request
                return None

        block = _pick_vote_block(mdata)
        if not block:
            return None

        # Question is reliable from the members endpoint
        question = block.get("voteQuestion")

        # find this member’s row
        member_row = None
        for row in (block.get("results") or []):
            if (row.get("bioguideID") or "").upper() == bioguideId:
                member_row = row
                break
        if not member_row:
            return None

        # Best-effort: fetch bill title
        title = None
        if bill_type and bill_number:
            bill_url = f"{BASE_URL}/bill/{congress}/{str(bill_type).lower()}/{bill_number}"
            try:
                async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
                    br = await client.get(bill_url, params={"api_key": API_KEY})
                    if br.status_code == 200:
                        title = (br.json().get("bill") or {}).get("title")
            except Exception:
                title = None

        return {
            "roll": roll,
            "legislationType": bill_type,
            "legislationNumber": bill_number,
            "title": title,                 
            "question": question,          
            "result": rb.get("result"),
            "started": rb.get("startDate"),
            "position": _normalize_position(member_row.get("voteCast")),
            "partyAtVote": member_row.get("voteParty"),
            "stateAtVote": member_row.get("voteState"),
            "legislationUrl": block.get("legislationUrl"),
        }

    votes = [v for v in await asyncio.gather(*(fetch_roll_for_member(rb) for rb in roll_blocks)) if v]

    # 3) stats from normalized positions
    stats = {
        "total": len(votes),
        "yea": sum(1 for v in votes if v["position"] == "Yea"),
        "nay": sum(1 for v in votes if v["position"] == "Nay"),
        "present": sum(1 for v in votes if v["position"] == "Present"),
        "notVoting": sum(1 for v in votes if v["position"] == "Not Voting"),
    }

    # 4) add tiny profile header
    profile = await get_member_detail(bioguideId)

    return {
        "profile": profile,
        "congress": congress,
        "session": session,
        "window": window,
        "stats": stats,
        "votes": votes,
    }
