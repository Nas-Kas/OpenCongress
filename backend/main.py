from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import date, datetime
import re, os, httpx, asyncio
import asyncpg
from dotenv import load_dotenv
from typing import Optional

load_dotenv()

API_KEY = os.getenv("CONGRESS_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")
BASE_URL = os.getenv("BASE_URL", "https://api.congress.gov/v3")
FALLBACK_TO_API = os.getenv("FALLBACK_TO_API", "1").lower() not in ("0", "false", "no")

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL in .env")

app = FastAPI()

# Allow both localhost + 127.0.0.1 in dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------
# Startup/shutdown: DB pool
# ---------------------------
@app.on_event("startup")
async def _startup():
    app.state.pool = await asyncpg.create_pool(
        DATABASE_URL, min_size=1, max_size=10
    )

@app.on_event("shutdown")
async def _shutdown():
    await app.state.pool.close()

# ---------------------------
# Helpers
# ---------------------------
def _normalize_position(pos: Optional[str]) -> str:
    t = (pos or "").strip().lower()
    if t in ("yea", "yes", "aye", "y"): return "Yea"
    if t in ("nay", "no", "n"):         return "Nay"
    if t == "present":                  return "Present"
    if t in ("not voting", "notvoting", "nv", "n/v", "absent"): return "Not Voting"
    return (pos or "").strip() or "—"

def _iso(v: Optional[date | datetime | str]) -> Optional[str]:
    if v is None: return None
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    return str(v)

async def _get_json(url: str, params: dict | None = None) -> dict:
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        r = await client.get(url, params=params or {})
        if r.status_code == 404:
            raise HTTPException(404, "Not found")
        r.raise_for_status()
        return r.json()

def _pick_vote_block(payload: dict) -> dict:
    if "houseRollCallMemberVotes" in payload:
        mv = payload.get("houseRollCallMemberVotes")
        if isinstance(mv, list) and mv: return mv[0] or {}
        if isinstance(mv, dict): return mv
    if "houseRollCallVoteMemberVotes" in payload:
        vv = payload.get("houseRollCallVoteMemberVotes")
        if isinstance(vv, dict): return vv
    return {}

# ---------------------------
# Routes (DB-first with API fallback)
# ---------------------------

@app.get("/house/votes")
async def list_house_votes(
    congress: int = Query(..., description="e.g., 119"),
    session: int | None = Query(None, description="e.g., 1 or 2"),
    limit: int = 50,
    offset: int = 0,
    include_titles: bool = Query(True, description="Join bill titles from DB (fast)"),
    include_questions: bool = Query(True, description="(kept for compat; DB already has questions)"),
):
    """
    Compact list of House roll-call votes for a Congress (optionally a session),
    DB first; fallback to API if DB has no rows.
    """
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        if session is None:
            rows = await conn.fetch(
                """
                SELECT hv.congress, hv.session, hv.roll,
                       hv.question, hv.result, hv.started,
                       hv.legislation_type, hv.legislation_number,
                       hv.source, hv.legislation_url,
                       CASE WHEN $1 THEN b.title ELSE NULL END AS title
                FROM house_votes hv
                LEFT JOIN bills b
                  ON b.congress = hv.congress
                 AND b.bill_type = LOWER(hv.legislation_type)
                 AND b.bill_number = hv.legislation_number
                WHERE hv.congress = $2
                ORDER BY hv.started DESC NULLS LAST, hv.roll DESC
                LIMIT $3 OFFSET $4
                """,
                include_titles, congress, limit, offset
            )
        else:
            rows = await conn.fetch(
                """
                SELECT hv.congress, hv.session, hv.roll,
                       hv.question, hv.result, hv.started,
                       hv.legislation_type, hv.legislation_number,
                       hv.source, hv.legislation_url,
                       CASE WHEN $1 THEN b.title ELSE NULL END AS title
                FROM house_votes hv
                LEFT JOIN bills b
                  ON b.congress = hv.congress
                 AND b.bill_type = LOWER(hv.legislation_type)
                 AND b.bill_number = hv.legislation_number
                WHERE hv.congress = $2 AND hv.session = $3
                ORDER BY hv.started DESC NULLS LAST, hv.roll DESC
                LIMIT $4 OFFSET $5
                """,
                include_titles, congress, session, limit, offset
            )

    out = [{
        "congress": r["congress"],
        "session": r["session"],
        "roll": r["roll"],
        "question": (r["question"] or None),
        "result": r["result"],
        "started": _iso(r["started"]),
        "legislationType": r["legislation_type"],
        "legislationNumber": r["legislation_number"],
        "source": r["legislation_url"] or r["source"],
        "title": r["title"] if include_titles else None,
    } for r in rows]

    # Fallback if DB returned nothing
    if not out and FALLBACK_TO_API and API_KEY:
        path = f"/house-vote/{congress}" + (f"/{session}" if session else "")
        data = await _get_json(f"{BASE_URL}{path}", {"api_key": API_KEY, "limit": limit, "offset": offset})
        blocks = data.get("houseRollCallVotes") or []

        async def fetch_title(v):
            t, n = v.get("legislationType"), v.get("legislationNumber")
            if not (t and n) or not include_titles:
                return None
            try:
                j = await _get_json(f"{BASE_URL}/bill/{congress}/{str(t).lower()}/{n}", {"api_key": API_KEY})
                return (j.get("bill") or {}).get("title")
            except Exception:
                return None

        titles = await asyncio.gather(*(fetch_title(b) for b in blocks))
        out = []
        for b, title in zip(blocks, titles):
            out.append({
                "congress": b.get("congress"),
                "session": b.get("sessionNumber"),
                "roll": b.get("rollCallNumber"),
                "question": b.get("voteQuestion"),
                "result": b.get("result"),
                "started": b.get("startDate"),
                "legislationType": b.get("legislationType"),
                "legislationNumber": b.get("legislationNumber"),
                "source": b.get("sourceDataURL"),
                "title": title,
            })

    return out


@app.get("/house/vote-detail")
async def house_vote_detail(
    congress: int = Query(...),
    session: int = Query(...),
    roll: int = Query(...),
):
    """
    Everything the UI needs for one roll: ballots + counts + bill + meta.
    DB first; fallback to API if not found.
    """
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        hv = await conn.fetchrow(
            "SELECT * FROM house_votes WHERE congress=$1 AND session=$2 AND roll=$3",
            congress, session, roll
        )

        if hv:
            # Ballots with member names (fallback to empty string)
            ballots = await conn.fetch(
                """
                SELECT hvm.bioguide_id,
                       COALESCE(m.name, '') AS name,
                       hvm.vote_state AS state,
                       hvm.vote_party AS party,
                       hvm.position
                FROM house_vote_members hvm
                LEFT JOIN members m ON m.bioguide_id = hvm.bioguide_id
                WHERE hvm.congress=$1 AND hvm.session=$2 AND hvm.roll=$3
                ORDER BY name ASC, hvm.bioguide_id ASC
                """, congress, session, roll
            )

            # Counts
            if ballots:
                counts = {
                    "total": len(ballots),
                    "yea": sum(1 for b in ballots if _normalize_position(b["position"]) == "Yea"),
                    "nay": sum(1 for b in ballots if _normalize_position(b["position"]) == "Nay"),
                    "present": sum(1 for b in ballots if _normalize_position(b["position"]) == "Present"),
                    "notVoting": sum(1 for b in ballots if _normalize_position(b["position"]) == "Not Voting"),
                }
            else:
                counts = {
                    "total": (hv["yea_count"] or 0) + (hv["nay_count"] or 0) + (hv["present_count"] or 0) + (hv["not_voting_count"] or 0),
                    "yea": hv["yea_count"] or 0,
                    "nay": hv["nay_count"] or 0,
                    "present": hv["present_count"] or 0,
                    "notVoting": hv["not_voting_count"] or 0,
                }

            # Bill payload (optional)
            bill = None
            t = hv["legislation_type"]
            n = hv["legislation_number"]
            if t and n:
                b = await conn.fetchrow(
                    """
                    SELECT congress, bill_type, bill_number, title, introduced_date, latest_action, public_url
                    FROM bills
                    WHERE congress=$1 AND bill_type=LOWER($2) AND bill_number=$3
                    """, congress, t, n
                )
                tvs = await conn.fetch(
                    """
                    SELECT version_type, url
                    FROM bill_text_versions
                    WHERE congress=$1 AND bill_type=LOWER($2) AND bill_number=$3
                    ORDER BY version_type
                    """, congress, t, n
                )
                if b:
                    bill = {
                        "congress": b["congress"],
                        "billType": b["bill_type"],
                        "billNumber": b["bill_number"],
                        "title": b["title"],
                        "introducedDate": _iso(b["introduced_date"]),
                        "latestAction": b["latest_action"],
                        "titles": None,
                        "latestSummary": None,
                        "textVersions": [{"type": tv["version_type"], "url": tv["url"]} for tv in tvs],
                        "publicUrl": b["public_url"] or hv["legislation_url"] or hv["source"],
                        "actions": None,
                    }

            # Flatten rows for table
            rows = [{
                "bioguideId": r["bioguide_id"],
                "name": r["name"] or r["bioguide_id"],
                "state": r["state"],
                "party": r["party"],
                "position": _normalize_position(r["position"]),
            } for r in ballots]

            meta = {
                "congress": hv["congress"],
                "session": hv["session"],
                "roll": hv["roll"],
                "legislationType": hv["legislation_type"],
                "legislationNumber": hv["legislation_number"],
                "result": hv["result"],
                "question": hv["question"],
                "source": hv["source"],
                "legislationUrl": hv["legislation_url"] or hv["source"],
            }

            return {"meta": meta, "counts": counts, "votes": rows, "bill": bill}

    # --- Fallback to API if not found in DB ---
    if not (FALLBACK_TO_API and API_KEY):
        raise HTTPException(404, "Vote not found in database.")

    vote_payload = await _get_json(f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members", {"api_key": API_KEY})
    block = _pick_vote_block(vote_payload)
    if not block:
        raise HTTPException(404, "Vote not found via API.")

    rows = [{
        "bioguideId": m.get("bioguideID"),
        "name": f"{(m.get('firstName') or '').strip()} {(m.get('lastName') or '').strip()}".strip(),
        "state": m.get("voteState"),
        "party": m.get("voteParty"),
        "position": _normalize_position(m.get("voteCast")),
    } for m in (block.get("results") or [])]

    counts = {
        "total": len(rows),
        "yea": sum(1 for r in rows if r["position"] == "Yea"),
        "nay": sum(1 for r in rows if r["position"] == "Nay"),
        "present": sum(1 for r in rows if r["position"] == "Present"),
        "notVoting": sum(1 for r in rows if r["position"] == "Not Voting"),
    }

    bill = None
    bt = (block.get("legislationType") or "").lower().strip()
    bn = str(block.get("legislationNumber") or "").strip()
    if bt and bn:
        bill_json = {}
        texts_json = {}
        try:
            bill_json  = await _get_json(f"{BASE_URL}/bill/{congress}/{bt}/{bn}", {"api_key": API_KEY})
            texts_json = await _get_json(f"{BASE_URL}/bill/{congress}/{bt}/{bn}/text", {"api_key": API_KEY})
        except Exception:
            pass
        bill_obj = bill_json.get("bill") or {}
        text_versions = []
        for tv in (texts_json.get("textVersions") or []):
            link = None
            for f in (tv.get("formats") or []):
                if f.get("type") in ("PDF","HTML") and f.get("url"): link = f["url"]; break
            text_versions.append({"type": tv.get("type"), "url": link})
        bill = {
            "congress": congress, "billType": bt, "billNumber": bn,
            "title": bill_obj.get("title"),
            "introducedDate": bill_obj.get("introducedDate"),
            "latestAction": bill_obj.get("latestAction"),
            "titles": None, "latestSummary": None,
            "textVersions": text_versions,
            "publicUrl": block.get("legislationUrl") or block.get("sourceDataURL"),
            "actions": None,
        }

    meta = {
        "congress": congress, "session": session, "roll": roll,
        "legislationType": block.get("legislationType"),
        "legislationNumber": block.get("legislationNumber"),
        "result": block.get("result"),
        "question": block.get("voteQuestion"),
        "source": block.get("sourceDataURL"),
        "legislationUrl": block.get("legislationUrl"),
    }
    return {"meta": meta, "counts": counts, "votes": rows, "bill": bill}


# --- MEMBER DETAIL (DB -> API fallback) --------------------------------------

@app.get("/member/{bioguideId}")
async def get_member_detail(bioguideId: str):
    """
    Minimal member profile from DB. If not in DB and fallback enabled, fetch from API.
    """
    bioguideId = bioguideId.upper()
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        m = await conn.fetchrow(
            "SELECT bioguide_id, name, party, state, image_url FROM members WHERE bioguide_id=$1",
            bioguideId
        )
    if m:
        return {
            "bioguideId": m["bioguide_id"],
            "name": m["name"] or bioguideId,
            "party": m["party"],
            "state": m["state"],
            "imageUrl": m["image_url"],
            "raw": None,
        }

    if not (FALLBACK_TO_API and API_KEY):
        raise HTTPException(404, "Member not found in database")

    j = await _get_json(f"{BASE_URL}/member/{bioguideId}", {"api_key": API_KEY})
    mem = (j.get("member") or j.get("data", {}).get("member")) or {}
    name = mem.get("name") or f"{mem.get('firstName','')} {mem.get('lastName','')}".strip()
    party = mem.get("partyName") or mem.get("party")
    state = mem.get("state")
    image = (mem.get("depiction") or {}).get("imageUrl") if isinstance(mem.get("depiction"), dict) else None
    return {
        "bioguideId": bioguideId,
        "name": name or bioguideId,
        "party": party,
        "state": state,
        "imageUrl": image,
        "raw": mem,
    }


# --- MEMBER HOUSE VOTES (DB -> API fallback) ---------------------------------

@app.get("/member/{bioguideId}/house-votes")
async def get_member_house_votes(
    bioguideId: str,
    congress: int = Query(..., description="e.g., 119 or 118"),
    session: int = Query(1, description="1 or 2"),
    window: int = Query(150, ge=1, le=500, description="how many recent roll calls to scan"),
    offset: int = 0,
):
    """
    Member's recent House votes from the DB (joined with house_votes and bills).
    If DB has none, fallback to API scan for the window.
    """
    bioguideId = bioguideId.upper()
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        profile = await conn.fetchrow(
            "SELECT bioguide_id, name, party, state, image_url FROM members WHERE bioguide_id=$1",
            bioguideId
        )
        votes = await conn.fetch(
            """
            SELECT
              hvm.roll,
              hv.legislation_type, hv.legislation_number,
              hv.question, hv.result, hv.started,
              hvm.position,
              hv.legislation_url,
              b.title
            FROM house_vote_members hvm
            JOIN house_votes hv
              ON hv.congress=hvm.congress AND hv.session=hvm.session AND hv.roll=hvm.roll
            LEFT JOIN bills b
              ON b.congress=hv.congress AND b.bill_type=LOWER(hv.legislation_type) AND b.bill_number=hv.legislation_number
            WHERE hvm.bioguide_id=$1 AND hv.congress=$2 AND hv.session=$3
            ORDER BY hv.started DESC NULLS LAST, hvm.roll DESC
            LIMIT $4 OFFSET $5
            """,
            bioguideId, congress, session, window, offset
        )

    if votes:
        votes_out = [{
            "roll": v["roll"],
            "legislationType": v["legislation_type"],
            "legislationNumber": v["legislation_number"],
            "title": v["title"],
            "question": v["question"],
            "result": v["result"],
            "started": _iso(v["started"]),
            "position": _normalize_position(v["position"]),
            "partyAtVote": None,
            "stateAtVote": None,
            "legislationUrl": v["legislation_url"],
        } for v in votes]

        stats = {
            "total": len(votes_out),
            "yea": sum(1 for v in votes_out if v["position"] == "Yea"),
            "nay": sum(1 for v in votes_out if v["position"] == "Nay"),
            "present": sum(1 for v in votes_out if v["position"] == "Present"),
            "notVoting": sum(1 for v in votes_out if v["position"] == "Not Voting"),
        }

        profile_out = {
            "bioguideId": (profile["bioguide_id"] if profile else bioguideId),
            "name": (profile["name"] if profile else None) or bioguideId,
            "party": profile["party"] if profile else None,
            "state": profile["state"] if profile else None,
            "imageUrl": profile["image_url"] if profile else None,
        }

        return {
            "profile": profile_out,
            "congress": congress,
            "session": session,
            "window": window,
            "stats": stats,
            "votes": votes_out,
        }

    # --- Fallback to API if no DB rows ---
    if not (FALLBACK_TO_API and API_KEY):
        raise HTTPException(404, "No member votes found in database")

    # get a small window of recent votes, then find this member's position per roll
    list_url = f"{BASE_URL}/house-vote/{congress}/{session}"
    ldata = await _get_json(list_url, {"api_key": API_KEY, "limit": window, "offset": offset})
    roll_blocks = (ldata.get("houseRollCallVotes") or [])[:window]

    out = []
    for rb in roll_blocks:
        roll = rb.get("rollCallNumber")
        if roll is None:
            continue
        mjson = await _get_json(f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members", {"api_key": API_KEY})
        block = _pick_vote_block(mjson)
        if not block:
            continue
        found = None
        for r in (block.get("results") or []):
            if (r.get("bioguideID") or "").upper() == bioguideId:
                found = r; break
        if not found:
            continue

        title = None
        t, n = rb.get("legislationType"), rb.get("legislationNumber")
        if t and n:
            try:
                bj = await _get_json(f"{BASE_URL}/bill/{congress}/{str(t).lower()}/{n}", {"api_key": API_KEY})
                title = (bj.get("bill") or {}).get("title")
            except Exception:
                title = None

        out.append({
            "roll": roll,
            "legislationType": t,
            "legislationNumber": n,
            "title": title,
            "question": block.get("voteQuestion"),
            "result": rb.get("result"),
            "started": rb.get("startDate"),
            "position": _normalize_position(found.get("voteCast")),
            "partyAtVote": found.get("voteParty"),
            "stateAtVote": found.get("voteState"),
            "legislationUrl": block.get("legislationUrl"),
        })

    stats = {
        "total": len(out),
        "yea": sum(1 for v in out if v["position"] == "Yea"),
        "nay": sum(1 for v in out if v["position"] == "Nay"),
        "present": sum(1 for v in out if v["position"] == "Present"),
        "notVoting": sum(1 for v in out if v["position"] == "Not Voting"),
    }

    # profile fallback
    prof = None
    if profile:
        prof = {
            "bioguideId": profile["bioguide_id"],
            "name": profile["name"] or bioguideId,
            "party": profile["party"],
            "state": profile["state"],
            "imageUrl": profile["image_url"],
        }
    else:
        # fetch minimal profile from API
        try:
            j = await _get_json(f"{BASE_URL}/member/{bioguideId}", {"api_key": API_KEY})
            mem = (j.get("member") or j.get("data", {}).get("member")) or {}
            name = mem.get("name") or f"{mem.get('firstName','')} {mem.get('lastName','')}".strip()
            party = mem.get("partyName") or mem.get("party")
            state = mem.get("state")
            image = (mem.get("depiction") or {}).get("imageUrl") if isinstance(mem.get("depiction"), dict) else None
            prof = {
                "bioguideId": bioguideId,
                "name": name or bioguideId,
                "party": party,
                "state": state,
                "imageUrl": image,
            }
        except Exception:
            prof = {"bioguideId": bioguideId, "name": bioguideId, "party": None, "state": None, "imageUrl": None}

    return {
        "profile": prof,
        "congress": congress,
        "session": session,
        "window": window,
        "stats": stats,
        "votes": out,
    }

# --- MEMBER SEARCH (DB) ------------------------------------------------------

from fastapi import FastAPI, HTTPException, Query
import re

@app.get("/search/members")
async def search_members(
    q: str = Query(..., min_length=1, description="Name, Bioguide ID, state, party"),
    limit: int = Query(10, ge=1, le=50)
):
    """
    Simple case-insensitive search over members by name, bioguide_id, state, or party.
    Returns up to `limit` rows ordered by 'best guess' relevance.
    """
    q = q.strip()
    if not q:
        return []

    # Prevent wildcard-injection from user input
    safe = re.sub(r"[%_]", " ", q)
    pattern = f"%{safe}%"

    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT bioguide_id,
                   COALESCE(name, bioguide_id) AS name,
                   party,
                   state,
                   image_url
            FROM members
            WHERE (name ILIKE $1 OR bioguide_id ILIKE $1 OR state ILIKE $1 OR party ILIKE $1)
            ORDER BY
              -- a light relevance boost: exact bioguide match first, then prefix name match, then name ASC
              (CASE WHEN bioguide_id ILIKE $2 THEN 0
                    WHEN name ILIKE $3 THEN 1
                    ELSE 2 END),
              name ASC
            LIMIT $4
            """,
            pattern,
            safe,            # $2: exact-ish bioguide match
            f"{safe}%",      # $3: name prefix
            limit
        )

    return [
        {
            "bioguideId": r["bioguide_id"],
            "name": r["name"],
            "party": r["party"],
            "state": r["state"],
            "imageUrl": r["image_url"],
        }
        for r in rows
    ]

@app.get("/bill/{congress}/{bill_type}/{bill_number}")
async def get_bill_view(
    congress: int,
    bill_type: str,
    bill_number: str,
):
    """
    Returns bill header (from DB or API fallback) plus all House roll calls
    for that bill, ordered chronologically.
    """
    bt = bill_type.lower()
    pool: asyncpg.Pool = app.state.pool

    async with pool.acquire() as conn:
        bill_row = await conn.fetchrow(
            """
            SELECT congress, bill_type, bill_number, title, introduced_date, latest_action, public_url
            FROM bills
            WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
            """,
            congress, bt, bill_number
        )
        tv_rows = await conn.fetch(
            """
            SELECT version_type, url
            FROM bill_text_versions
            WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
            ORDER BY version_type
            """,
            congress, bt, bill_number
        )
        vote_rows = await conn.fetch(
            """
            SELECT session, roll, question, result, started,
                   yea_count, nay_count, present_count, not_voting_count,
                   legislation_url
            FROM house_votes
            WHERE congress=$1
              AND legislation_type ILIKE $2
              AND legislation_number=$3
            ORDER BY started ASC NULLS LAST, roll ASC
            """,
            congress, bill_type, bill_number
        )

    # Bill header (DB first, then API fallback)
    title = introduced = latest_action = public_url = None
    text_versions = [{"type": r["version_type"], "url": r["url"]} for r in tv_rows]

    if bill_row:
        title = bill_row["title"]
        introduced = bill_row["introduced_date"]
        latest_action = bill_row["latest_action"]
        public_url = bill_row["public_url"]
    elif API_KEY:
        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                base = f"{BASE_URL}/bill/{congress}/{bt}/{bill_number}"
                br = await client.get(base, params={"api_key": API_KEY})
                br.raise_for_status()
                b = (br.json().get("bill") or {})
                title = b.get("title")
                introduced = b.get("introducedDate")
                latest_action = b.get("latestAction")
                public_url = b.get("govtrackURL") or b.get("url")

                try:
                    tr = await client.get(f"{base}/text", params={"api_key": API_KEY})
                    if tr.status_code == 200:
                        tvs = (tr.json().get("textVersions") or [])
                        text_versions = []
                        for tv in tvs:
                            url = None
                            for f in (tv.get("formats") or []):
                                if f.get("type") in ("PDF", "HTML") and f.get("url"):
                                    url = f["url"]; break
                            if tv.get("type") and url:
                                text_versions.append({"type": tv["type"], "url": url})
                except Exception:
                    pass
        except Exception:
            pass  # keep bill header as None if API falls over

    votes = []
    for v in vote_rows:
        yea = v["yea_count"] or 0
        nay = v["nay_count"] or 0
        present = v["present_count"] or 0
        nv = v["not_voting_count"] or 0
        votes.append({
            "session": v["session"],
            "roll": v["roll"],
            "question": v["question"],
            "result": v["result"],
            "started": _iso(v["started"]),
            "counts": {
                "yea": yea, "nay": nay, "present": present, "notVoting": nv,
                "total": yea + nay + present + nv
            },
            "legislationUrl": v["legislation_url"],
        })

    return {
        "bill": {
            "congress": congress,
            "billType": bt,
            "billNumber": str(bill_number),
            "title": title,
            "introducedDate": _iso(introduced),
            "latestAction": latest_action,
            "publicUrl": public_url,
            "textVersions": text_versions,
        },
        "votes": votes,
    }

def _strip_html(s: str | None) -> str:
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()

@app.get("/bill/{congress}/{bill_type}/{bill_number}/summaries")
async def bill_summaries(congress: int, bill_type: str, bill_number: str):
    if not API_KEY:
        raise HTTPException(500, "Missing CONGRESS_API_KEY")

    bill_type = bill_type.lower()
    url = f"{BASE_URL}/bill/{congress}/{bill_type}/{bill_number}/summaries"

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, params={"api_key": API_KEY})
            resp.raise_for_status()
            raw = resp.json() or {}
    except httpx.HTTPStatusError as e:
        # surface real API problems (bad bill ids, etc.)
        raise HTTPException(e.response.status_code, f"Congress API error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch summaries: {e}") from e

    out = []
    for s in raw.get("summaries") or []:
        out.append({
            "date": s.get("dateIssued") or s.get("actionDate") or (s.get("updateDate") or "")[:10],
            "source": s.get("source") or s.get("actionDesc") or "CRS",
            "text": _strip_html(s.get("text") or s.get("summary")),
        })
    return {"summaries": out}