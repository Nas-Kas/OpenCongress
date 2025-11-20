from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import date, datetime, timezone
import re, os, httpx, asyncio, json
import asyncpg
from dotenv import load_dotenv
from typing import Optional
from pydantic import BaseModel
from decimal import Decimal
from bill_text_scraper import BillTextScraper
from gemini_bill_summarizer import GeminiBillSummarizer
from bill_rag_embedder import BillRAGEmbedder
from fastapi import FastAPI, HTTPException, Query
import re

load_dotenv()

API_KEY = os.getenv("CONGRESS_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
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
                       hv.yea_count, hv.nay_count, hv.present_count, hv.not_voting_count,
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
                       hv.yea_count, hv.nay_count, hv.present_count, hv.not_voting_count,
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
        "yeaCount": r["yea_count"],
        "nayCount": r["nay_count"],
        "presentCount": r["present_count"],
        "notVotingCount": r["not_voting_count"],
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
                "yeaCount": None,  # API fallback doesn't have counts
                "nayCount": None,
                "presentCount": None,
                "notVotingCount": None,
            })

    return {"votes": out}


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

@app.get("/bills/no-votes")
async def get_bills_without_votes(
    congress: int = Query(119, description="Congress number"),
    limit: int = Query(50, description="Number of bills to return"),
    offset: int = Query(0, description="Offset for pagination"),
    bill_type: Optional[str] = Query(None, description="Filter by bill type (hr, s, etc.)")
):
    """
    Get bills that haven't had House votes yet - perfect for early-stage betting markets.
    """
    async with app.state.pool.acquire() as conn:
        # Build the query with optional bill_type filter
        where_clause = "WHERE hv.congress IS NULL AND b.congress = $1"
        params = [congress]
        
        if bill_type:
            where_clause += " AND b.bill_type = $" + str(len(params) + 1)
            params.append(bill_type.lower())
        
        query = f"""
            SELECT 
                b.congress,
                b.bill_type,
                b.bill_number,
                b.title,
                b.introduced_date,
                b.latest_action,
                b.public_url,
                b.updated_at
            FROM bills b
            LEFT JOIN house_votes hv ON (
                hv.congress = b.congress 
                AND LOWER(hv.legislation_type) = b.bill_type 
                AND hv.legislation_number = b.bill_number
            )
            {where_clause}
            ORDER BY b.updated_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
        """
        params.extend([limit, offset])
        
        rows = await conn.fetch(query, *params)
        
        # Get total count for pagination
        count_query = f"""
            SELECT COUNT(*)
            FROM bills b
            LEFT JOIN house_votes hv ON (
                hv.congress = b.congress 
                AND LOWER(hv.legislation_type) = b.bill_type 
                AND hv.legislation_number = b.bill_number
            )
            {where_clause.replace(f'LIMIT ${len(params) - 1} OFFSET ${len(params)}', '')}
        """
        total_count = await conn.fetchval(count_query, *params[:-2])
        
        bills = []
        for r in rows:
            # Parse latest_action JSON if it exists
            latest_action = r["latest_action"]
            if isinstance(latest_action, str):
                try:
                    import json
                    latest_action = json.loads(latest_action)
                except:
                    pass
            
            bills.append({
                "congress": r["congress"],
                "billType": r["bill_type"],
                "billNumber": r["bill_number"],
                "title": r["title"],
                "introducedDate": r["introduced_date"].isoformat() if r["introduced_date"] else None,
                "latestAction": latest_action,
                "publicUrl": r["public_url"],
                "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else None
            })
        
        return {
            "bills": bills,
            "total": total_count,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + limit < total_count
        }

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

def _format_financial_info(financial_info: dict) -> str:
    """Format financial information for display"""
    parts = []
    
    if financial_info.get('appropriations'):
        parts.append(f"Appropriations: {len(financial_info['appropriations'])} items")
    
    if financial_info.get('authorizations'):
        parts.append(f"Authorizations: {len(financial_info['authorizations'])} items")
    
    if financial_info.get('penalties'):
        parts.append(f"Penalties/Fines: {len(financial_info['penalties'])} items")
    
    if not parts:
        return "No specific financial provisions identified"
    
    return "; ".join(parts)

@app.post("/bill/{congress}/{bill_type}/{bill_number}/generate-summary")
async def generate_bill_summary(congress: int, bill_type: str, bill_number: str, force_refresh: bool = False):
    """Generate a summary by scraping bill text from congress.gov with caching"""
    import asyncio
    import json
    
    pool: asyncpg.Pool = app.state.pool
    
    try:
        async with pool.acquire() as conn:
            # Check if we have a cached summary (unless force_refresh is True)
            if not force_refresh:
                print(f"Checking cache for {congress}/{bill_type}/{bill_number}")
                cached_summary = await conn.fetchrow(
                    "SELECT summary, created_at FROM bill_summaries WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                    congress, bill_type, bill_number
                )
                
                if cached_summary:
                    print("Found cached summary, returning it")
                    summary_data = cached_summary['summary']
                    
                    # Parse JSON if it's a string
                    if isinstance(summary_data, str):
                        summary_data = json.loads(summary_data)
                    
                    # Return cached data in the same format
                    cached_response = dict(summary_data)
                    cached_response["cached"] = True
                    cached_response["cached_at"] = cached_summary['created_at'].isoformat()
                    return cached_response
            
            # Check if we have bill text URLs to work with
            print(f"Checking for bill text URLs for {congress}/{bill_type}/{bill_number}")
            text_versions = await conn.fetch(
                "SELECT version_type, url FROM bill_text_versions WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
            
            if not text_versions:
                print("No bill text URLs found, checking if bill exists")
                bill_exists = await conn.fetchrow(
                    "SELECT title FROM bills WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                    congress, bill_type, bill_number
                )
                if not bill_exists:
                    raise HTTPException(404, "Bill not found in database")
                else:
                    raise HTTPException(404, "Bill text not available - no text versions found")
        
        print(f"Starting summary generation for {congress}/{bill_type}/{bill_number}")
        
        # Define the summary generation task
        async def generate_summary_task():
            # Try Gemini first if API key is available
            if GEMINI_API_KEY:
                print("Using Gemini AI for bill summarization...")
                
                # Get PDF URL from text_versions
                pdf_url = None
                for version in text_versions:
                    if version['url'] and version['url'].endswith('.pdf'):
                        pdf_url = version['url']
                        break
                
                if pdf_url:
                    gemini_summarizer = GeminiBillSummarizer(GEMINI_API_KEY)
                    result = gemini_summarizer.summarize_bill_from_url(pdf_url, congress, bill_type, bill_number)
                    
                    if result and result.get('success'):
                        print("Gemini summarization successful!")
                        return {
                            'title': result['title'],
                            'url': result['source_url'],
                            'length': result['text_length'],
                            'scraped_at': result['scraped_at']
                        }, result['summary_data']
                    else:
                        print("Gemini failed, falling back to text scraper...")
            
            # Fallback to original text scraper
            print("Falling back to text scraper...")
            scraper = BillTextScraper(API_KEY)
            
            # Get the bill text (API first, then scraping)
            print("Fetching bill text...")
            bill_data = scraper.get_bill_text(congress, bill_type, bill_number)
            
            if not bill_data:
                raise HTTPException(404, "Could not fetch bill text from congress.gov")
            
            print(f"Bill text fetched: {bill_data['length']:,} characters")
            
            # Check if the text is extremely large
            if bill_data['length'] > 500000:  # 500k characters
                print(f"Warning: Very large bill text ({bill_data['length']:,} chars)")
            
            # Generate summary with error handling
            print("Generating summary...")
            summary_data = scraper.generate_summary(bill_data['text'], bill_data['title'])
            
            return bill_data, summary_data
        
        # Run with timeout (5 minutes)
        try:
            bill_data, summary_data = await asyncio.wait_for(
                generate_summary_task(), 
                timeout=300.0  # 5 minutes
            )
        except asyncio.TimeoutError:
            print("Summary generation timed out")
            raise HTTPException(408, "Summary generation timed out - bill may be too large")
        
        print("Summary generation completed successfully")
        
        # Prepare the response data in the format the frontend expects
        response_data = {
            "success": True,
            "cached": False,
            "bill_info": {
                "congress": congress,
                "bill_type": bill_type,
                "bill_number": bill_number,
                "title": bill_data['title'],
                "source_url": bill_data['url'],
                "text_length": bill_data['length']
            },
            "generated_at": bill_data['scraped_at']
        }
        
        # Handle Gemini response (already has frontend format) vs traditional scraper
        if 'tldr' in summary_data:
            # Gemini response - already formatted for frontend
            response_data.update({
                "tldr": summary_data['tldr'],
                "keyPoints": summary_data['keyPoints'],
                "financialInfo": summary_data['financialInfo'],
                "importance": summary_data['importance'],
                "readingTime": summary_data['readingTime'],
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        else:
            # Traditional scraper response - convert to frontend format
            response_data.update({
                "tldr": summary_data['summary'],
                "keyPoints": [phrase['context'][:100] + "..." if len(phrase['context']) > 100 else phrase['context'] 
                             for phrase in summary_data['key_phrases'][:5]],
                "financialInfo": _format_financial_info(summary_data['financial_info']),
                "importance": min(5, max(1, len(summary_data['key_phrases']) // 3 + 2)),
                "readingTime": f"{summary_data['estimated_reading_time']} minute{'s' if summary_data['estimated_reading_time'] != 1 else ''}",
                "analysis": {
                    "key_phrases": summary_data['key_phrases'][:10],
                    "sections": summary_data['sections'][:5],
                    "word_count": summary_data['word_count'],
                    "estimated_reading_time": summary_data['estimated_reading_time']
                }
            })
        
        # Only cache successful summaries (those with actual content)
        if response_data.get('tldr') and response_data['tldr'].strip():
            print("Caching summary in database...")
            async with pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO bill_summaries (congress, bill_type, bill_number, summary)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (congress, bill_type, bill_number)
                    DO UPDATE SET summary = $4, updated_at = now()
                    """,
                    congress, bill_type, bill_number, json.dumps(response_data)
                )
            print("Summary cached successfully")
        else:
            print("Summary is empty - not caching")
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in summary generation: {str(e)}")
        raise HTTPException(500, f"Error generating summary: {str(e)}")

# === RAG SYSTEM ENDPOINTS ===

class EmbedBillRequest(BaseModel):
    pdf_url: str

class QueryBillRequest(BaseModel):
    question: str
    top_k: Optional[int] = 8

@app.post("/bill/{congress}/{bill_type}/{bill_number}/embed")
async def embed_bill(congress: int, bill_type: str, bill_number: str, request: EmbedBillRequest):
    """Embed a bill for RAG queries"""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    pool: asyncpg.Pool = app.state.pool
    
    try:
        # If no PDF URL provided, try to get it from database
        pdf_url = request.pdf_url
        
        if not pdf_url:
            async with pool.acquire() as conn:
                pdf_url = await conn.fetchval(
                    """
                    SELECT url FROM bill_text_versions 
                    WHERE congress = $1 AND bill_type = $2 AND bill_number = $3 
                    AND url LIKE '%.pdf'
                    LIMIT 1
                    """,
                    congress, bill_type, bill_number
                )
            
            if not pdf_url:
                raise HTTPException(404, "No PDF URL found for this bill in database")
        
        embedder = BillRAGEmbedder(GEMINI_API_KEY, pool)
        await embedder.embed_bill(congress, bill_type, bill_number, pdf_url)
        
        # Count chunks
        async with pool.acquire() as conn:
            chunk_count = await conn.fetchval(
                "SELECT COUNT(*) FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
        
        return {
            "success": True,
            "congress": congress,
            "bill_type": bill_type,
            "bill_number": bill_number,
            "chunks": chunk_count
        }
    
    except Exception as e:
        print(f"Error embedding bill: {str(e)}")
        raise HTTPException(500, f"Error embedding bill: {str(e)}")

@app.post("/bill/{congress}/{bill_type}/{bill_number}/ask")
async def query_bill(congress: int, bill_type: str, bill_number: str, request: QueryBillRequest):
    """Ask a question about a bill using RAG"""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    pool: asyncpg.Pool = app.state.pool
    
    try:
        # Check if bill is embedded
        async with pool.acquire() as conn:
            chunk_count = await conn.fetchval(
                "SELECT COUNT(*) FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
        
        if chunk_count == 0:
            raise HTTPException(404, "Bill has not been embedded yet. Please embed it first.")
        
        embedder = BillRAGEmbedder(GEMINI_API_KEY, pool)
        answer = await embedder.query_bill(
            congress, bill_type, bill_number, 
            request.question, request.top_k
        )
        
        return {
            "success": True,
            "question": request.question,
            "answer": answer,
            "chunks_used": request.top_k,
            "total_chunks": chunk_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error querying bill: {str(e)}")
        raise HTTPException(500, f"Error querying bill: {str(e)}")