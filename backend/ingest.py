import os, asyncio, argparse, json, zlib
from datetime import datetime, date
from typing import Optional, Tuple, Iterable

import httpx
import asyncpg
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://api.congress.gov/v3")
API_KEY = os.getenv("CONGRESS_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# ============================ Helpers ============================

def normalize_position(pos: Optional[str]) -> str:
    t = (pos or "").strip().lower()
    if t in ("yea", "yes", "aye", "y"): return "Yea"
    if t in ("nay", "no", "n"):         return "Nay"
    if t == "present":                  return "Present"
    if t in ("not voting", "notvoting", "nv", "n/v", "absent"): return "Not Voting"
    return (pos or "").strip() or "—"

def pick_vote_block(payload: dict) -> dict:
    if "houseRollCallMemberVotes" in payload:
        mv = payload.get("houseRollCallMemberVotes")
        if isinstance(mv, list) and mv: return mv[0] or {}
        if isinstance(mv, dict): return mv
    if "houseRollCallVoteMemberVotes" in payload:
        vv = payload.get("houseRollCallVoteMemberVotes")
        if isinstance(vv, dict): return vv
    return {}

# Mapping of procedural vote questions to their associated bills
# This handles edge cases where all parsing methods fail
# Format: (congress, session, roll): (rule_type, rule_num, subject_type, subject_num)
PROCEDURAL_VOTE_MAPPINGS = {
    # Only add truly ambiguous cases here - most votes are now parsed automatically
    # Example: (119, 1, 305): ("HCONRES", "58", "HR", "456"),
}

import re

def parse_bill_from_question(question: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extract bill type and number from vote question text.
    Returns (bill_type, bill_number) or (None, None) if not found.
    
    Handles patterns like:
    - "On Passage of H.R. 1949"
    - "On Agreeing to H. Con. Res. 58"
    - "On Motion to Recommit S. 2341"
    """
    if not question:
        return None, None
    
    # Patterns for different bill types (order matters - most specific first)
    patterns = [
        # House/Senate Concurrent Resolutions: H.Con.Res., H. Con. Res., HCONRES, etc.
        (r'\b(H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?)\s+(\d+)\b', 
         {'HCONRES': 'HCONRES', 'SCONRES': 'SCONRES'}),
        
        # House/Senate Joint Resolutions: H.J.Res., H. J. Res., HJRES, etc.
        (r'\b(H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?)\s+(\d+)\b',
         {'HJRES': 'HJRES', 'SJRES': 'SJRES'}),
        
        # House/Senate Simple Resolutions: H.Res., H. Res., HRES, etc.
        (r'\b(H\.?\s*Res\.?|S\.?\s*Res\.?)\s+(\d+)\b',
         {'HRES': 'HRES', 'SRES': 'SRES'}),
        
        # House/Senate Bills: H.R., H. R., HR, S., etc.
        (r'\b(H\.?\s*R\.?|S\.?)\s+(\d+)\b',
         {'HR': 'HR', 'S': 'S'}),
    ]
    
    for pattern, type_map in patterns:
        match = re.search(pattern, question, re.IGNORECASE)
        if match:
            bill_type_raw = match.group(1)
            bill_number = match.group(2)
            
            # Normalize bill type (remove dots, spaces, make uppercase)
            bill_type_normalized = re.sub(r'[.\s]', '', bill_type_raw).upper()
            
            # Map to standard format
            bill_type = type_map.get(bill_type_normalized, bill_type_normalized)
            
            return bill_type, bill_number
    
    return None, None


async def parse_subject_bill_from_hres(
    client: httpx.AsyncClient, 
    congress: int, 
    hres_number: str
) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse the subject bill from an HRES title.
    
    HRES titles often follow patterns like:
    - "Providing for consideration of H.R. 456"
    - "Waiving points of order against the bill H.R. 789"
    
    Returns (subject_bill_type, subject_bill_number) or (None, None)
    """
    try:
        # Fetch HRES details from API
        url = f"{BASE_URL}/bill/{congress}/hres/{hres_number}"
        params = {"api_key": API_KEY}
        
        resp = await client.get(url, params=params, timeout=10.0)
        if resp.status_code != 200:
            return None, None
        
        data = resp.json()
        bill_data = data.get("bill", {})
        title = bill_data.get("title", "")
        
        if not title:
            return None, None
        
        # Parse bill reference from title
        return parse_bill_from_question(title)
        
    except Exception as e:
        print(f"[warning] Failed to fetch HRES {hres_number} for subject bill parsing: {e}")
        return None, None

def to_date(v) -> Optional[date]:
    """Parse 'YYYY-MM-DD' or ISO datetime strings into a date, else None."""
    if not v:
        return None
    s = str(v).strip()
    try:
        if len(s) == 10 and s[4] == "-" and s[7] == "-":
            return date.fromisoformat(s)
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        return datetime.fromisoformat(s).date()
    except Exception:
        return None

async def get_json(client: httpx.AsyncClient, url: str, params: dict | None = None, *, max_retries=3):
    """GET with basic 429 retry + timeout handling."""
    attempt = 0
    while True:
        try:
            r = await client.get(url, params=params or {})
            if r.status_code == 429:
                retry_after = r.headers.get("Retry-After")
                wait = int(retry_after) if retry_after and retry_after.isdigit() else (2 ** attempt)
                await asyncio.sleep(wait)
                attempt += 1
                if attempt > max_retries:
                    r.raise_for_status()
                continue
            r.raise_for_status()
            return r.json()
        except (httpx.ReadTimeout, httpx.ConnectTimeout):
            if attempt >= max_retries:
                raise
            await asyncio.sleep(2 ** attempt)
            attempt += 1

# ============================ SQL ============================

HOUSE_VOTES_UPSERT = """
INSERT INTO house_votes AS hv
  (congress, session, roll, chamber, question, result, started,
   legislation_type, legislation_number, subject_bill_type, subject_bill_number,
   source, legislation_url,
   yea_count, nay_count, present_count, not_voting_count)
VALUES
  ($1,$2,$3,'House',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
ON CONFLICT (congress, session, roll) DO UPDATE SET
  question            = COALESCE(EXCLUDED.question, hv.question),
  result              = COALESCE(EXCLUDED.result, hv.result),
  started             = COALESCE(EXCLUDED.started, hv.started),
  legislation_type    = COALESCE(EXCLUDED.legislation_type, hv.legislation_type),
  legislation_number  = COALESCE(EXCLUDED.legislation_number, hv.legislation_number),
  subject_bill_type   = COALESCE(EXCLUDED.subject_bill_type, hv.subject_bill_type),
  subject_bill_number = COALESCE(EXCLUDED.subject_bill_number, hv.subject_bill_number),
  source              = COALESCE(EXCLUDED.source, hv.source),
  legislation_url     = COALESCE(EXCLUDED.legislation_url, hv.legislation_url),
  yea_count           = COALESCE(EXCLUDED.yea_count, hv.yea_count),
  nay_count           = COALESCE(EXCLUDED.nay_count, hv.nay_count),
  present_count       = COALESCE(EXCLUDED.present_count, hv.present_count),
  not_voting_count    = COALESCE(EXCLUDED.not_voting_count, hv.not_voting_count)
"""

HOUSE_VOTE_MEMBERS_UPSERT = """
INSERT INTO house_vote_members AS hvm
  (congress, session, roll, chamber, bioguide_id, vote_state, vote_party, position)
VALUES
  ($1,$2,$3,'House',$4,$5,$6,$7)
ON CONFLICT (congress, session, roll, bioguide_id) DO UPDATE SET
  vote_state = EXCLUDED.vote_state,
  vote_party = EXCLUDED.vote_party,
  position   = EXCLUDED.position
"""

MEMBERS_UPSERT = """
INSERT INTO members AS m
  (bioguide_id, name, party, state, image_url, updated_at)
VALUES
  ($1,$2,$3,$4,NULL, now())
ON CONFLICT (bioguide_id) DO UPDATE SET
  name       = COALESCE(EXCLUDED.name, m.name),
  party      = COALESCE(EXCLUDED.party, m.party),
  state      = COALESCE(EXCLUDED.state, m.state),
  updated_at = now()
"""

MEMBER_PROFILE_UPDATE = """
UPDATE members
   SET name      = COALESCE($2, name),
       party     = COALESCE($3, party),
       state     = COALESCE($4, state),
       image_url = COALESCE($5, image_url),
       updated_at= now()
 WHERE bioguide_id = $1
"""

BILLS_UPSERT = """
INSERT INTO bills AS b
  (congress, bill_type, bill_number, title, introduced_date, latest_action, public_url, updated_at)
VALUES
  ($1,$2,$3,$4,$5,$6::jsonb,$7, now())
ON CONFLICT (congress, bill_type, bill_number) DO UPDATE SET
  title           = COALESCE(EXCLUDED.title, b.title),
  introduced_date = COALESCE(EXCLUDED.introduced_date, b.introduced_date),
  latest_action   = COALESCE(EXCLUDED.latest_action, b.latest_action),
  public_url      = COALESCE(EXCLUDED.public_url, b.public_url),
  updated_at      = now()
"""

BILL_TEXT_VERSIONS_UPSERT = """
INSERT INTO bill_text_versions
  (congress, bill_type, bill_number, version_type, url)
VALUES
  ($1,$2,$3,$4,$5)
ON CONFLICT (congress, bill_type, bill_number, version_type) DO UPDATE SET
  url = EXCLUDED.url
"""

CHECK_BALLOTS_EXIST = """
SELECT 1
FROM house_vote_members
WHERE congress=$1 AND session=$2 AND roll=$3
LIMIT 1
"""

UPSERT_CHECKPOINT = """
INSERT INTO ingestion_checkpoints (feed, last_offset, last_run_at)
VALUES ($1, $2, now())
ON CONFLICT (feed) DO UPDATE SET
  last_offset = EXCLUDED.last_offset,
  last_run_at = now()
"""

GET_CHECKPOINT = "SELECT last_offset FROM ingestion_checkpoints WHERE feed=$1"

# ======================== Advisory locks ========================

_async_locks = {}  # process-local locks

def _bill_lock_key(congress: int, bill_type: str, bill_number: str) -> int:
    s = f"bill:{congress}:{bill_type.lower()}:{bill_number}"
    return zlib.crc32(s.encode("utf-8"))

async def acquire_bill_locks(conn: asyncpg.Connection, key: int):
    lock = _async_locks.get(key)
    if lock is None:
        lock = _async_locks[key] = asyncio.Lock()
    await lock.acquire()
    await conn.execute("SELECT pg_advisory_xact_lock($1);", key)
    return lock

# ============================ API ============================

async def fetch_vote_list(client, congress: int, session: int, *, limit=200, offset=0):
    url = f"{BASE_URL}/house-vote/{congress}/{session}"
    data = await get_json(client, url, params={"api_key": API_KEY, "limit": limit, "offset": offset})
    return data.get("houseRollCallVotes") or []

async def fetch_members_for_roll(client, congress: int, session: int, roll: int):
    url = f"{BASE_URL}/house-vote/{congress}/{session}/{roll}/members"
    data = await get_json(client, url, params={"api_key": API_KEY})
    return pick_vote_block(data)

async def fetch_bill_details(client, congress: int, bill_type: str, bill_number: str):
    base = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}"
    bill = await get_json(client, base, params={"api_key": API_KEY})
    text = {}
    try:
        text = await get_json(client, f"{base}/text", params={"api_key": API_KEY})
    except Exception:
        text = {}
    return bill.get("bill") or {}, text.get("textVersions") or []

async def fetch_member_profile(client, bioguide: str):
    j = await get_json(client, f"{BASE_URL}/member/{bioguide}", params={"api_key": API_KEY})
    m = (j.get("member") or j.get("data", {}).get("member")) or {}
    name  = m.get("name") or f"{m.get('firstName','')} {m.get('lastName','')}".strip()
    party = m.get("partyName") or m.get("party")
    state = m.get("state")
    image = None
    dep = m.get("depiction")
    if isinstance(dep, dict):
        image = dep.get("imageUrl")
    return name, party, state, image

# ============================ DB Ops ============================

async def reset_db(pool: asyncpg.Pool):
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute("""
              TRUNCATE TABLE
                bill_text_versions,
                bills,
                house_vote_members,
                house_votes,
                members,
                ingestion_checkpoints
              RESTART IDENTITY CASCADE
            """)
    print("DB reset: all tables truncated.")

async def backfill_missing_bills(pool: asyncpg.Pool, client: httpx.AsyncClient) -> Tuple[int,int]:
    async with pool.acquire() as conn:
        todo = await conn.fetch("""
          SELECT DISTINCT
                 hv.congress,
                 LOWER(hv.legislation_type) AS bill_type,
                 hv.legislation_number     AS bill_number,
                 COALESCE(hv.legislation_url, hv.source) AS fallback_url
          FROM house_votes hv
          LEFT JOIN bills b
            ON b.congress   = hv.congress
           AND b.bill_type  = LOWER(hv.legislation_type)
           AND b.bill_number= hv.legislation_number
          WHERE hv.legislation_type IS NOT NULL
            AND hv.legislation_number IS NOT NULL
            AND b.congress IS NULL
          ORDER BY 1 DESC, 2 ASC, 3 ASC
        """)
    total = len(todo)
    if not total:
        print("Backfill bills: nothing to do.")
        return 0, 0

    tv_count = 0
    for i, r in enumerate(todo, 1):
        c  = r["congress"]; bt = r["bill_type"]; bn = r["bill_number"]; fallback = r["fallback_url"]
        title = None; introduced_dt = None; latest = None
        public_url = fallback
        text_versions = []
        try:
            bill, tvs = await fetch_bill_details(client, c, bt, bn)
            title = bill.get("title")
            introduced_dt = to_date(bill.get("introducedDate"))
            latest = bill.get("latestAction")
            public_url = public_url or bill.get("govtrackURL") or None
            for t in tvs:
                fmt_url = None
                for f in (t.get("formats") or []):
                    if f.get("type") in ("PDF", "HTML") and f.get("url"):
                        fmt_url = f["url"]; break
                if t.get("type") and fmt_url:
                    text_versions.append((t["type"], fmt_url))
        except Exception as e:
            print(f"[{i}/{total}] {bt.upper()} {bn}: bill API failed ({e}); writing stub.")

        key = _bill_lock_key(c, bt, bn)
        async with pool.acquire() as conn:
            async with conn.transaction():
                lock = await acquire_bill_locks(conn, key)
                try:
                    await conn.execute(BILLS_UPSERT, c, bt, bn, title, introduced_dt,
                                       json.dumps(latest) if latest else None, public_url)
                    for vt, url in text_versions:
                        await conn.execute(BILL_TEXT_VERSIONS_UPSERT, c, bt, bn, vt, url)
                        tv_count += 1
                finally:
                    lock.release()
        print(f"[{i}/{total}] upserted {bt.upper()} {bn}")
    return total, tv_count

async def enrich_missing_member_images(
    pool: asyncpg.Pool,
    client: httpx.AsyncClient,
    *,
    only_ids: Optional[Iterable[str]] = None,
    limit: int = 1000,
    workers: int = 6,
):
    """Fetch Congress member profiles to populate image_url (and fill missing name/party/state)."""
    if not API_KEY:
        print("Skip image enrichment: CONGRESS_API_KEY missing.")
        return

    async with pool.acquire() as conn:
        if only_ids:
            ids = list({bid.upper() for bid in only_ids})
            todo = await conn.fetch(
                """
                SELECT bioguide_id
                  FROM members
                 WHERE image_url IS NULL
                   AND bioguide_id = ANY($1::text[])
                 ORDER BY bioguide_id
                 LIMIT $2
                """,
                ids, limit
            )
        else:
            todo = await conn.fetch(
                """
                SELECT bioguide_id
                  FROM members
                 WHERE image_url IS NULL
                 ORDER BY bioguide_id
                 LIMIT $1
                """,
                limit
            )

    if not todo:
        print("Member image enrichment: nothing to do.")
        return

    sem = asyncio.Semaphore(max(1, workers))
    total = len(todo)
    done = 0

    async def worker(bioguide: str):
        nonlocal done
        async with sem:
            try:
                name, party, state, image = await fetch_member_profile(client, bioguide)
            except Exception as e:
                print(f"{bioguide}: profile fetch failed: {e}")
                return
            async with pool.acquire() as conn:
                await conn.execute(MEMBER_PROFILE_UPDATE, bioguide, name, party, state, image)
            done += 1
            print(f"[{done}/{total}] updated {bioguide}")

    await asyncio.gather(*(worker(r["bioguide_id"]) for r in todo))
    print(f"Member image enrichment complete: {done} updated.")

# ============================ Ingest one roll ============================

async def ingest_roll(pool: asyncpg.Pool, client: httpx.AsyncClient, congress: int, session: int, rb: dict, *, force_members=False):
    roll = rb.get("rollCallNumber")
    if roll is None:
        return

    question = rb.get("voteQuestion") or None
    legislation_url = rb.get("legislationUrl") or None
    t = (rb.get("legislationType") or "").strip()
    n = (str(rb.get("legislationNumber") or "")).strip()
    
    # Initialize subject bill fields
    subject_t = None
    subject_n = None

    # Step 1: Try parsing from question text if API didn't provide bill info
    if not t or not n:
        t_parsed, n_parsed = parse_bill_from_question(question or "")
        if t_parsed and n_parsed:
            t, n = t_parsed, n_parsed
            print(f"[parsed from question] roll #{roll}: {t} {n}")

    # Step 2: Check hardcoded mappings for truly ambiguous cases
    if not t or not n:
        mapping_key = (congress, session, roll)
        if mapping_key in PROCEDURAL_VOTE_MAPPINGS:
            mapping = PROCEDURAL_VOTE_MAPPINGS[mapping_key]
            if len(mapping) == 4:
                t, n, subject_t, subject_n = mapping
            else:
                t, n = mapping
            print(f"[hardcoded mapping] roll #{roll}: {t} {n}")

    # Step 3: If this is an HRES, try to extract the subject bill
    if t and t.upper() == "HRES" and n and not subject_t:
        subject_t, subject_n = await parse_subject_bill_from_hres(client, congress, n)
        if subject_t and subject_n:
            print(f"[parsed HRES subject] roll #{roll}: HRES {n} is about {subject_t} {subject_n}")

    started = rb.get("startDate")
    started_ts = None
    if started:
        try:
            started_ts = datetime.fromisoformat(started.replace("Z", "+00:00"))
        except Exception:
            started_ts = None

    # Parent upsert (counts unknown yet)
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                HOUSE_VOTES_UPSERT,
                congress, session, roll,
                question, rb.get("result"), started_ts,
                t or rb.get("legislationType"), n or rb.get("legislationNumber"),
                subject_t, subject_n,
                rb.get("sourceDataURL"), legislation_url,
                None, None, None, None
            )

            # Skip members fetch if we already have ballots
            already_have = False
            if not force_members:
                exists = await conn.fetchval(CHECK_BALLOTS_EXIST, congress, session, roll)
                already_have = exists is not None

    rows = []
    if not already_have or not question or not legislation_url or not t or not n:
        try:
            block = await fetch_members_for_roll(client, congress, session, roll)
        except Exception:
            block = {}
        if block:
            question = question or block.get("voteQuestion")
            legislation_url = legislation_url or block.get("legislationUrl")
            if not t:
                t = (block.get("legislationType") or "").strip()
            if not n:
                n = (str(block.get("legislationNumber") or "")).strip()
            rows = block.get("results") or []

    # Upsert ballots + minimal members + counts
    touched_bioguide_ids = set()
    yea = nay = present = nv = None
    if rows:
        rows.sort(key=lambda m: (m.get("bioguideID") or ""))
        yea     = sum(1 for m in rows if normalize_position(m.get("voteCast")) == "Yea")
        nay     = sum(1 for m in rows if normalize_position(m.get("voteCast")) == "Nay")
        present = sum(1 for m in rows if normalize_position(m.get("voteCast")) == "Present")
        nv      = sum(1 for m in rows if normalize_position(m.get("voteCast")) == "Not Voting")

        async with pool.acquire() as conn:
            async with conn.transaction():
                for m in rows:
                    bioguide = (m.get("bioguideID") or "").upper()
                    touched_bioguide_ids.add(bioguide)
                    first = (m.get("firstName") or "").strip()
                    last  = (m.get("lastName") or "").strip()
                    name  = f"{first} {last}".strip() or None
                    await conn.execute(MEMBERS_UPSERT, bioguide, name, m.get("voteParty"), m.get("voteState"))
                    await conn.execute(
                        HOUSE_VOTE_MEMBERS_UPSERT,
                        congress, session, roll,
                        bioguide, m.get("voteState"), m.get("voteParty"),
                        normalize_position(m.get("voteCast")),
                    )

    # Update parent with final counts & improved fields
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                HOUSE_VOTES_UPSERT,
                congress, session, roll,
                question, rb.get("result"), started_ts,
                t or rb.get("legislationType"), n or rb.get("legislationNumber"),
                subject_t, subject_n,
                rb.get("sourceDataURL"), legislation_url,
                yea, nay, present, nv
            )

    # Bill header + text versions (write stub even if API fails)
    if t and n:
        key = _bill_lock_key(congress, t, n)
        async with pool.acquire() as conn:
            async with conn.transaction():
                lock = await acquire_bill_locks(conn, key)
                try:
                    title = None; introduced_dt = None; latest_action = None
                    public_url = legislation_url
                    text_versions = []
                    try:
                        bill, tvs = await fetch_bill_details(client, congress, t, n)
                        title = bill.get("title")
                        introduced_dt = to_date(bill.get("introducedDate"))
                        latest_action = bill.get("latestAction")
                        public_url = public_url or bill.get("govtrackURL") or None
                        for tv in tvs:
                            vt, url = tv.get("type"), None
                            for f in (tv.get("formats") or []):
                                if f.get("type") in ("PDF", "HTML") and f.get("url"):
                                    url = f["url"]; break
                            if vt and url:
                                text_versions.append((vt, url))
                    except Exception:
                        pass

                    await conn.execute(
                        BILLS_UPSERT,
                        congress, t.lower(), n, title, introduced_dt,
                        json.dumps(latest_action) if latest_action else None,
                        public_url
                    )
                    for vt, url in text_versions:
                        await conn.execute(BILL_TEXT_VERSIONS_UPSERT, congress, t.lower(), n, vt, url)
                finally:
                    lock.release()

    return touched_bioguide_ids

# ============================ Modes ============================

async def run_update(congress: int, session: int, *, limit_recent=300, workers=1,
                     reset_all=False, backfill_bills=True, backfill_texts=True,
                     enrich_member_images=True, enrich_limit=1000):
    if not API_KEY or not DATABASE_URL:
        raise SystemExit("Missing CONGRESS_API_KEY or DATABASE_URL")

    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    timeout = httpx.Timeout(connect=10.0, read=15.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        if reset_all:
            await reset_db(pool)

        votes = await fetch_vote_list(client, congress, session, limit=limit_recent, offset=0)
        total = len([v for v in votes if v.get("rollCallNumber") is not None])
        print(f"Update: found {total} recent rolls.")
        sem = asyncio.Semaphore(max(1, workers))
        idx = 0
        touched: set[str] = set()

        async def worker(rb):
            nonlocal idx, touched
            async with sem:
                idx += 1
                roll = rb.get("rollCallNumber")
                print(f"[{idx}/{total}] ingest roll #{roll}")
                ids = await ingest_roll(pool, client, congress, session, rb, force_members=False)
                touched |= (ids or set())

        await asyncio.gather(*(worker(rb) for rb in votes if rb.get("rollCallNumber") is not None))

        if backfill_bills or backfill_texts:
            filled, tvs = await backfill_missing_bills(pool, client)
            if filled:
                print(f"Backfill: inserted/updated {filled} bills; added {tvs} text versions.")

        if enrich_member_images:
            # Prefer enriching recently-touched IDs; if none, fall back to global nulls
            only_ids = touched if touched else None
            await enrich_missing_member_images(pool, client, only_ids=only_ids, limit=enrich_limit, workers=6)

    await pool.close()

async def run_full(congress: int, session: int, *, batch_size=200, workers=1,
                   reset_all=False, backfill_bills=True, backfill_texts=True,
                   enrich_member_images=True, enrich_limit=1000):
    if not API_KEY or not DATABASE_URL:
        raise SystemExit("Missing CONGRESS_API_KEY or DATABASE_URL")

    feed = f"house-vote-{congress}-{session}"
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    timeout = httpx.Timeout(connect=10.0, read=15.0, write=10.0, pool=10.0)
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        if reset_all:
            await reset_db(pool)
            async with pool.acquire() as conn:
                await conn.execute("DELETE FROM ingestion_checkpoints WHERE feed=$1", feed)
            offset = 0
        else:
            async with pool.acquire() as conn:
                offset = await conn.fetchval(GET_CHECKPOINT, feed) or 0

        processed = 0
        while True:
            votes = await fetch_vote_list(client, congress, session, limit=batch_size, offset=offset)
            if not votes:
                break

            chunk = [rb for rb in votes if rb.get("rollCallNumber") is not None]
            total_chunk = len(chunk)
            print(f"Full ingest: batch offset {offset}, {total_chunk} rolls")

            sem = asyncio.Semaphore(max(1, workers))
            idx = 0
            touched: set[str] = set()

            async def worker(rb):
                nonlocal idx, processed, touched
                async with sem:
                    idx += 1
                    processed += 1
                    roll = rb.get("rollCallNumber")
                    print(f"[batch {offset}] [{idx}/{total_chunk}] ingest roll #{roll}")
                    ids = await ingest_roll(pool, client, congress, session, rb, force_members=True)
                    touched |= (ids or set())

            await asyncio.gather(*(worker(rb) for rb in chunk))

            if enrich_member_images and touched:
                await enrich_missing_member_images(pool, client, only_ids=touched, limit=enrich_limit, workers=6)

            offset += batch_size
            async with pool.acquire() as conn:
                await conn.execute(UPSERT_CHECKPOINT, feed, offset)

        print(f"Full ingest complete. Total rolls processed: {processed}")

        if backfill_bills or backfill_texts:
            filled, tvs = await backfill_missing_bills(pool, client)
            if filled:
                print(f"Backfill: inserted/updated {filled} bills; added {tvs} text versions.")

        if enrich_member_images:
            await enrich_missing_member_images(pool, client, only_ids=None, limit=enrich_limit, workers=6)

    await pool.close()

# ============================ CLI ============================

def main():
    ap = argparse.ArgumentParser(description="Ingest House roll-call votes into Postgres.")
    ap.add_argument("--congress", type=int, required=True)
    ap.add_argument("--session", type=int, required=True, choices=[1, 2])
    ap.add_argument("--mode", choices=["update", "full"], default="update",
                    help="'update' = refresh latest N votes; 'full' = walk all with offset+checkpoint")
    ap.add_argument("--limit-recent", type=int, default=300, help="update mode: how many recent votes to scan")
    ap.add_argument("--batch-size", type=int, default=200, help="full mode: page size for offset loop")
    ap.add_argument("--workers", type=int, default=1, help="max concurrent rolls to ingest (start with 1)")

    # quality-of-life
    ap.add_argument("--reset-all", action="store_true",
                    help="TRUNCATE all tables before ingest (and clear checkpoint for 'full').")
    ap.add_argument("--no-backfill-bills", dest="backfill_bills", action="store_false",
                    help="Skip post-ingest bill backfill.")
    ap.add_argument("--no-backfill-texts", dest="backfill_texts", action="store_false",
                    help="Skip post-ingest text-versions backfill.")

    # NEW: member image enrichment
    ap.add_argument("--no-enrich-member-images", dest="enrich_member_images", action="store_false",
                    help="Skip enriching member image_url via Congress member endpoint.")
    ap.add_argument("--enrich-limit", type=int, default=1000,
                    help="Max members to enrich per run/batch (default 1000).")

    args = ap.parse_args()

    if args.mode == "update":
        asyncio.run(run_update(args.congress, args.session,
                               limit_recent=args.limit_recent,
                               workers=max(1, args.workers),
                               reset_all=args.reset_all,
                               backfill_bills=args.backfill_bills,
                               backfill_texts=args.backfill_texts,
                               enrich_member_images=args.enrich_member_images,
                               enrich_limit=args.enrich_limit))
    else:
        asyncio.run(run_full(args.congress, args.session,
                             batch_size=args.batch_size,
                             workers=max(1, args.workers),
                             reset_all=args.reset_all,
                             backfill_bills=args.backfill_bills,
                             backfill_texts=args.backfill_texts,
                             enrich_member_images=args.enrich_member_images,
                             enrich_limit=args.enrich_limit))

if __name__ == "__main__":
    main()
