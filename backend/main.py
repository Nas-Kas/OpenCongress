from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from datetime import date, datetime, timezone
import re, os, httpx, asyncio
import asyncpg
from dotenv import load_dotenv
from typing import Optional
from pydantic import BaseModel
from decimal import Decimal
from bill_text_scraper import BillTextScraper

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

@app.get("/bill/{congress}/{bill_type}/{bill_number}/generate-summary")
async def generate_bill_summary(congress: int, bill_type: str, bill_number: str):
    """Generate a summary by scraping bill text from congress.gov"""
    import asyncio
    import signal
    
    def timeout_handler(signum, frame):
        raise TimeoutError("Summary generation timed out")
    
    try:
        # Set a timeout for the entire operation (5 minutes)
        signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(300)  # 5 minutes
        
        print(f"Starting summary generation for {congress}/{bill_type}/{bill_number}")
        
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
        
        # Cancel the timeout
        signal.alarm(0)
        
        print("Summary generation completed successfully")
        
        return {
            "success": True,
            "bill_info": {
                "congress": congress,
                "bill_type": bill_type,
                "bill_number": bill_number,
                "title": bill_data['title'],
                "source_url": bill_data['url'],
                "text_length": bill_data['length']
            },
            "summary": summary_data['summary'],
            "analysis": {
                "key_phrases": summary_data['key_phrases'][:10],  # Limit to top 10 for API response
                "sections": summary_data['sections'][:5],  # Limit to first 5 sections
                "word_count": summary_data['word_count'],
                "estimated_reading_time": summary_data['estimated_reading_time']
            },
            "generated_at": bill_data['scraped_at']
        }
        
    except TimeoutError:
        signal.alarm(0)
        print("Summary generation timed out")
        raise HTTPException(408, "Summary generation timed out - bill may be too large")
    except HTTPException:
        signal.alarm(0)
        raise
    except Exception as e:
        signal.alarm(0)
        print(f"Error in summary generation: {str(e)}")
        raise HTTPException(500, f"Error generating summary: {str(e)}")

# === BETTING SYSTEM ENDPOINTS ===

class CreateUserRequest(BaseModel):
    username: str
    email: Optional[str] = None

class PlaceBetRequest(BaseModel):
    market_id: int
    user_id: int
    position: str  # 'pass' or 'fail'
    amount: float

class CreateMarketRequest(BaseModel):
    congress: int
    bill_type: str
    bill_number: str
    title: Optional[str] = None
    description: Optional[str] = None
    deadline: Optional[str] = None  # ISO datetime string
    market_type: str = "bill_passage"  # 'bill_passage', 'member_vote', 'vote_count', 'timeline'
    target_member: Optional[str] = None  # bioguide_id for member_vote markets
    target_count: Optional[int] = None   # for vote_count markets
    target_date: Optional[str] = None    # ISO date for timeline markets
    bill_exists: bool = True  # false for speculative bills

class CreateSpeculativeBillRequest(BaseModel):
    congress: int
    bill_type: str
    bill_number: str
    title: str
    description: Optional[str] = None
    expected_intro_date: Optional[str] = None

@app.post("/users")
async def create_user(request: CreateUserRequest):
    """Create a new user account with starting balance"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        try:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (username, email)
                VALUES ($1, $2)
                RETURNING user_id
                """,
                request.username, request.email
            )
            return {"user_id": user_id, "username": request.username, "balance": 1000.00}
        except asyncpg.UniqueViolationError:
            raise HTTPException(400, "Username already exists")

@app.get("/users/{user_id}")
async def get_user(user_id: int):
    """Get user profile and balance"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        user = await conn.fetchrow(
            "SELECT user_id, username, email, balance, created_at FROM users WHERE user_id = $1",
            user_id
        )
        if not user:
            raise HTTPException(404, "User not found")
        
        return {
            "user_id": user["user_id"],
            "username": user["username"],
            "email": user["email"],
            "balance": float(user["balance"]),
            "created_at": _iso(user["created_at"])
        }

@app.get("/markets")
async def list_betting_markets(
    status: str = Query("active", description="active, resolved, or all"),
    limit: int = Query(50, le=100)
):
    """List betting markets"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        if status == "all":
            markets = await conn.fetch(
                """
                SELECT bm.*, b.title as bill_title
                FROM betting_markets bm
                LEFT JOIN bills b ON b.congress = bm.congress 
                    AND b.bill_type = bm.bill_type 
                    AND b.bill_number = bm.bill_number
                ORDER BY bm.created_at DESC
                LIMIT $1
                """,
                limit
            )
        else:
            markets = await conn.fetch(
                """
                SELECT bm.*, b.title as bill_title
                FROM betting_markets bm
                LEFT JOIN bills b ON b.congress = bm.congress 
                    AND b.bill_type = bm.bill_type 
                    AND b.bill_number = bm.bill_number
                WHERE bm.status = $1
                ORDER BY bm.created_at DESC
                LIMIT $2
                """,
                status, limit
            )
        
        # Get current odds for each market
        result = []
        for market in markets:
            odds = await conn.fetch(
                "SELECT position, odds FROM market_odds WHERE market_id = $1",
                market["market_id"]
            )
            
            # Get total betting volume
            volume = await conn.fetchval(
                "SELECT COALESCE(SUM(amount), 0) FROM bets WHERE market_id = $1",
                market["market_id"]
            ) or 0
            
            # Get member name for member_vote markets
            member_name = None
            if market["market_type"] == "member_vote" and market["target_member"]:
                member_row = await conn.fetchrow(
                    "SELECT name FROM members WHERE bioguide_id = $1",
                    market["target_member"]
                )
                member_name = member_row["name"] if member_row else market["target_member"]
            
            result.append({
                "market_id": market["market_id"],
                "congress": market["congress"],
                "bill_type": market["bill_type"],
                "bill_number": market["bill_number"],
                "title": market["title"] or market["bill_title"],
                "description": market["description"],
                "status": market["status"],
                "resolution": market["resolution"],
                "deadline": _iso(market["deadline"]),
                "created_at": _iso(market["created_at"]),
                "market_type": market["market_type"],
                "target_member": market["target_member"],
                "target_member_name": member_name,
                "target_count": market["target_count"],
                "target_date": _iso(market["target_date"]),
                "bill_exists": market["bill_exists"],
                "odds": {row["position"]: float(row["odds"]) for row in odds},
                "volume": float(volume)
            })
        
        return result

@app.post("/speculative-bills")
async def create_speculative_bill(request: CreateSpeculativeBillRequest):
    """Create a speculative/future bill for betting"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        expected_date = None
        if request.expected_intro_date:
            try:
                expected_date = datetime.fromisoformat(request.expected_intro_date).date()
            except ValueError:
                raise HTTPException(400, "Invalid expected_intro_date format")
        
        try:
            spec_bill_id = await conn.fetchval(
                """
                INSERT INTO speculative_bills (congress, bill_type, bill_number, title, description, expected_intro_date)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING spec_bill_id
                """,
                request.congress, request.bill_type.lower(), request.bill_number,
                request.title, request.description, expected_date
            )
            
            return {"spec_bill_id": spec_bill_id, "status": "created"}
        except asyncpg.UniqueViolationError:
            raise HTTPException(400, "Speculative bill already exists")

@app.post("/markets")
async def create_betting_market(request: CreateMarketRequest):
    """Create a new betting market for a bill"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        # Validate market type
        valid_types = ["bill_passage", "member_vote", "vote_count", "timeline"]
        if request.market_type not in valid_types:
            raise HTTPException(400, f"Invalid market_type. Must be one of: {valid_types}")
        
        # Check if bill exists (if bill_exists is True)
        bill_title = None
        if request.bill_exists:
            bill = await conn.fetchrow(
                "SELECT title FROM bills WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                request.congress, request.bill_type.lower(), request.bill_number
            )
            if bill:
                bill_title = bill["title"]
        else:
            # Check speculative bills
            spec_bill = await conn.fetchrow(
                "SELECT title FROM speculative_bills WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                request.congress, request.bill_type.lower(), request.bill_number
            )
            if spec_bill:
                bill_title = spec_bill["title"]
        
        # Validate member for member_vote markets
        if request.market_type == "member_vote":
            if not request.target_member:
                raise HTTPException(400, "target_member required for member_vote markets")
            
            # Verify member exists
            member = await conn.fetchrow(
                "SELECT name FROM members WHERE bioguide_id = $1",
                request.target_member.upper()
            )
            if not member:
                raise HTTPException(400, f"Member {request.target_member} not found")
        
        # Parse optional dates
        deadline = None
        if request.deadline:
            try:
                deadline = datetime.fromisoformat(request.deadline.replace('Z', '+00:00'))
            except ValueError:
                raise HTTPException(400, "Invalid deadline format")
        
        target_date = None
        if request.target_date:
            try:
                target_date = datetime.fromisoformat(request.target_date).date()
            except ValueError:
                raise HTTPException(400, "Invalid target_date format")
        
        market_id = await conn.fetchval(
            """
            INSERT INTO betting_markets (
                congress, bill_type, bill_number, title, description, deadline,
                market_type, target_member, target_count, target_date, bill_exists
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING market_id
            """,
            request.congress, request.bill_type.lower(), request.bill_number,
            request.title or bill_title, request.description, deadline,
            request.market_type, request.target_member, request.target_count, 
            target_date, request.bill_exists
        )
        
        # Set initial odds based on market type
        if request.market_type == "bill_passage":
            positions = [("pass", 2.0), ("fail", 2.0)]
        elif request.market_type == "member_vote":
            positions = [("yes", 2.0), ("no", 2.0)]
        elif request.market_type == "vote_count":
            positions = [("over", 2.0), ("under", 2.0)]
        elif request.market_type == "timeline":
            positions = [("before", 2.0), ("after", 2.0)]
        
        for position, odds in positions:
            await conn.execute(
                "INSERT INTO market_odds (market_id, position, odds) VALUES ($1, $2, $3)",
                market_id, position, odds
            )
        
        return {"market_id": market_id, "status": "created"}

@app.get("/markets/{market_id}")
async def get_market_detail(market_id: int):
    """Get detailed market information including recent bets"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        market = await conn.fetchrow(
            """
            SELECT bm.*, b.title as bill_title
            FROM betting_markets bm
            LEFT JOIN bills b ON b.congress = bm.congress 
                AND b.bill_type = bm.bill_type 
                AND b.bill_number = bm.bill_number
            WHERE bm.market_id = $1
            """,
            market_id
        )
        
        if not market:
            raise HTTPException(404, "Market not found")
        
        # Get current odds
        odds = await conn.fetch(
            "SELECT position, odds FROM market_odds WHERE market_id = $1",
            market_id
        )
        
        # Get recent bets
        recent_bets = await conn.fetch(
            """
            SELECT b.bet_id, b.position, b.amount, b.odds, b.placed_at, u.username
            FROM bets b
            JOIN users u ON u.user_id = b.user_id
            WHERE b.market_id = $1
            ORDER BY b.placed_at DESC
            LIMIT 20
            """,
            market_id
        )
        
        # Get betting stats
        stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(*) as total_bets,
                SUM(amount) as total_volume,
                SUM(CASE WHEN position = 'pass' THEN amount ELSE 0 END) as pass_volume,
                SUM(CASE WHEN position = 'fail' THEN amount ELSE 0 END) as fail_volume
            FROM bets 
            WHERE market_id = $1
            """,
            market_id
        )
        
        return {
            "market_id": market["market_id"],
            "congress": market["congress"],
            "bill_type": market["bill_type"],
            "bill_number": market["bill_number"],
            "title": market["title"] or market["bill_title"],
            "description": market["description"],
            "status": market["status"],
            "resolution": market["resolution"],
            "deadline": _iso(market["deadline"]),
            "created_at": _iso(market["created_at"]),
            "odds": {row["position"]: float(row["odds"]) for row in odds},
            "recent_bets": [
                {
                    "bet_id": bet["bet_id"],
                    "username": bet["username"],
                    "position": bet["position"],
                    "amount": float(bet["amount"]),
                    "odds": float(bet["odds"]) if bet["odds"] else None,
                    "placed_at": _iso(bet["placed_at"])
                }
                for bet in recent_bets
            ],
            "stats": {
                "total_bets": stats["total_bets"] or 0,
                "total_volume": float(stats["total_volume"] or 0),
                "pass_volume": float(stats["pass_volume"] or 0),
                "fail_volume": float(stats["fail_volume"] or 0)
            }
        }

@app.post("/bets")
async def place_bet(request: PlaceBetRequest):
    """Place a bet on a market"""
    if request.amount <= 0:
        raise HTTPException(400, "Bet amount must be positive")
    
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Check market exists and is active
            market = await conn.fetchrow(
                "SELECT status, deadline, market_type FROM betting_markets WHERE market_id = $1",
                request.market_id
            )
            
            if not market:
                raise HTTPException(404, "Market not found")
            
            # Validate position based on market type
            valid_positions = {
                "bill_passage": ["pass", "fail"],
                "member_vote": ["yes", "no"],
                "vote_count": ["over", "under"],
                "timeline": ["before", "after"]
            }
            
            market_type = market["market_type"]
            if market_type not in valid_positions:
                raise HTTPException(400, f"Unknown market type: {market_type}")
            
            if request.position not in valid_positions[market_type]:
                raise HTTPException(400, f"Invalid position '{request.position}' for {market_type} market. Valid positions: {valid_positions[market_type]}")
            
            # Continue with existing validation...
            
            if market["status"] != "active":
                raise HTTPException(400, "Market is not active")
            
            if market["deadline"] and datetime.now(timezone.utc) > market["deadline"]:
                raise HTTPException(400, "Betting deadline has passed")
            
            # Check user balance
            user = await conn.fetchrow(
                "SELECT balance FROM users WHERE user_id = $1",
                request.user_id
            )
            
            if not user:
                raise HTTPException(404, "User not found")
            
            if user["balance"] < request.amount:
                raise HTTPException(400, "Insufficient balance")
            
            # Get current odds
            odds_row = await conn.fetchrow(
                "SELECT odds FROM market_odds WHERE market_id = $1 AND position = $2",
                request.market_id, request.position
            )
            
            if not odds_row:
                raise HTTPException(400, "Invalid position for this market")
            
            current_odds = float(odds_row["odds"])
            potential_payout = request.amount * current_odds
            
            # Deduct from user balance
            await conn.execute(
                "UPDATE users SET balance = balance - $1, updated_at = now() WHERE user_id = $2",
                request.amount, request.user_id
            )
            
            # Place the bet
            bet_id = await conn.fetchval(
                """
                INSERT INTO bets (market_id, user_id, position, amount, odds, potential_payout)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING bet_id
                """,
                request.market_id, request.user_id, request.position, 
                request.amount, current_odds, potential_payout
            )
            
            # Update odds based on new betting volume (simple algorithm)
            await _update_market_odds(conn, request.market_id)
            
            return {
                "bet_id": bet_id,
                "amount": request.amount,
                "position": request.position,
                "odds": current_odds,
                "potential_payout": potential_payout
            }

@app.get("/users/{user_id}/bets")
async def get_user_bets(
    user_id: int,
    status: str = Query("all", description="active, resolved, or all"),
    limit: int = Query(50, le=100)
):
    """Get user's betting history"""
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        if status == "all":
            bets = await conn.fetch(
                """
                SELECT b.*, bm.congress, bm.bill_type, bm.bill_number, bm.title, bm.status as market_status
                FROM bets b
                JOIN betting_markets bm ON bm.market_id = b.market_id
                WHERE b.user_id = $1
                ORDER BY b.placed_at DESC
                LIMIT $2
                """,
                user_id, limit
            )
        else:
            bets = await conn.fetch(
                """
                SELECT b.*, bm.congress, bm.bill_type, bm.bill_number, bm.title, bm.status as market_status
                FROM bets b
                JOIN betting_markets bm ON bm.market_id = b.market_id
                WHERE b.user_id = $1 AND b.status = $2
                ORDER BY b.placed_at DESC
                LIMIT $3
                """,
                user_id, status, limit
            )
        
        return [
            {
                "bet_id": bet["bet_id"],
                "market_id": bet["market_id"],
                "position": bet["position"],
                "amount": float(bet["amount"]),
                "odds": float(bet["odds"]) if bet["odds"] else None,
                "potential_payout": float(bet["potential_payout"]) if bet["potential_payout"] else None,
                "status": bet["status"],
                "placed_at": _iso(bet["placed_at"]),
                "resolved_at": _iso(bet["resolved_at"]),
                "market": {
                    "congress": bet["congress"],
                    "bill_type": bet["bill_type"],
                    "bill_number": bet["bill_number"],
                    "title": bet["title"],
                    "status": bet["market_status"]
                }
            }
            for bet in bets
        ]

async def _update_market_odds(conn, market_id: int):
    """Simple odds calculation based on betting volume"""
    # Get total volume for each position
    volumes = await conn.fetch(
        """
        SELECT position, COALESCE(SUM(amount), 0) as volume
        FROM bets 
        WHERE market_id = $1 AND status = 'active'
        GROUP BY position
        """,
        market_id
    )
    
    volume_dict = {row["position"]: float(row["volume"]) for row in volumes}
    pass_volume = volume_dict.get("pass", 0)
    fail_volume = volume_dict.get("fail", 0)
    total_volume = pass_volume + fail_volume
    
    if total_volume == 0:
        # No bets yet, keep 50/50 odds
        return
    
    # Calculate implied probabilities (with some smoothing)
    smoothing = 100  # Prevents extreme odds
    pass_prob = (pass_volume + smoothing/2) / (total_volume + smoothing)
    fail_prob = (fail_volume + smoothing/2) / (total_volume + smoothing)
    
    # Convert to odds (with house edge)
    house_edge = 0.05  # 5% house edge
    pass_odds = (1 - house_edge) / pass_prob
    fail_odds = (1 - house_edge) / fail_prob
    
    # Update odds in database
    await conn.execute(
        """
        UPDATE market_odds 
        SET odds = $2, updated_at = now() 
        WHERE market_id = $1 AND position = 'pass'
        """,
        market_id, pass_odds
    )
    
    await conn.execute(
        """
        UPDATE market_odds 
        SET odds = $2, updated_at = now() 
        WHERE market_id = $1 AND position = 'fail'
        """,
        market_id, fail_odds
    )

@app.post("/markets/{market_id}/resolve")
async def resolve_market(market_id: int, resolution: str):
    """Resolve a betting market (admin function)"""
    if resolution not in ["pass", "fail", "withdrawn", "cancelled"]:
        raise HTTPException(400, "Invalid resolution")
    
    pool: asyncpg.Pool = app.state.pool
    async with pool.acquire() as conn:
        async with conn.transaction():
            # Update market status
            await conn.execute(
                """
                UPDATE betting_markets 
                SET status = 'resolved', resolution = $2, resolved_at = now(), updated_at = now()
                WHERE market_id = $1
                """,
                market_id, resolution
            )
            
            if resolution in ["pass", "fail"]:
                # Pay out winning bets
                winning_bets = await conn.fetch(
                    "SELECT bet_id, user_id, potential_payout FROM bets WHERE market_id = $1 AND position = $2 AND status = 'active'",
                    market_id, resolution
                )
                
                for bet in winning_bets:
                    # Add winnings to user balance
                    await conn.execute(
                        "UPDATE users SET balance = balance + $1, updated_at = now() WHERE user_id = $2",
                        bet["potential_payout"], bet["user_id"]
                    )
                    
                    # Mark bet as won
                    await conn.execute(
                        "UPDATE bets SET status = 'won', resolved_at = now() WHERE bet_id = $1",
                        bet["bet_id"]
                    )
                
                # Mark losing bets
                await conn.execute(
                    "UPDATE bets SET status = 'lost', resolved_at = now() WHERE market_id = $1 AND position != $2 AND status = 'active'",
                    market_id, resolution
                )
            
            elif resolution in ["withdrawn", "cancelled"]:
                # Refund all bets
                active_bets = await conn.fetch(
                    "SELECT bet_id, user_id, amount FROM bets WHERE market_id = $1 AND status = 'active'",
                    market_id
                )
                
                for bet in active_bets:
                    # Refund to user balance
                    await conn.execute(
                        "UPDATE users SET balance = balance + $1, updated_at = now() WHERE user_id = $2",
                        bet["amount"], bet["user_id"]
                    )
                    
                    # Mark bet as refunded
                    await conn.execute(
                        "UPDATE bets SET status = 'refunded', resolved_at = now() WHERE bet_id = $1",
                        bet["bet_id"]
                    )
            
            return {"status": "resolved", "resolution": resolution}