#!/usr/bin/env python3
"""
Bill Ingestion Script - Separate from vote-based ingestion
Fetches bills directly from Congress API to enable betting on bills without votes yet.
"""

import os, asyncio, argparse, json
from datetime import datetime, date
from typing import Optional, List, Dict, Any

import httpx
import asyncpg
from dotenv import load_dotenv

load_dotenv()

BASE_URL = os.getenv("BASE_URL", "https://api.congress.gov/v3")
API_KEY = os.getenv("CONGRESS_API_KEY")
DATABASE_URL = os.getenv("DATABASE_URL")

# ============================ Helpers ============================

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

# New table for bill sponsors/cosponsors (if we want to track this)
BILL_SPONSORS_UPSERT = """
INSERT INTO bill_sponsors AS bs
  (congress, bill_type, bill_number, bioguide_id, sponsor_type, name, party, state)
VALUES
  ($1,$2,$3,$4,$5,$6,$7,$8)
ON CONFLICT (congress, bill_type, bill_number, bioguide_id) DO UPDATE SET
  sponsor_type = EXCLUDED.sponsor_type,
  name = COALESCE(EXCLUDED.name, bs.name),
  party = COALESCE(EXCLUDED.party, bs.party),
  state = COALESCE(EXCLUDED.state, bs.state)
"""

# ============================ API Functions ============================

async def fetch_bills_list(client: httpx.AsyncClient, congress: int, *, 
                          limit: int = 250, offset: int = 0, 
                          sort: str = "updateDate+desc") -> List[Dict[str, Any]]:
    """Fetch list of bills from Congress API."""
    url = f"{BASE_URL}/bill/{congress}"
    params = {
        "api_key": API_KEY,
        "limit": limit,
        "offset": offset,
        "sort": sort
    }
    
    data = await get_json(client, url, params=params)
    return data.get("bills", [])

async def fetch_bill_details(client: httpx.AsyncClient, congress: int, 
                           bill_type: str, bill_number: str) -> Dict[str, Any]:
    """Fetch detailed bill information."""
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}"
    params = {"api_key": API_KEY}
    
    data = await get_json(client, url, params=params)
    return data.get("bill", {})

async def fetch_bill_text_versions(client: httpx.AsyncClient, congress: int, 
                                 bill_type: str, bill_number: str) -> List[Dict[str, Any]]:
    """Fetch bill text versions."""
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/text"
    params = {"api_key": API_KEY}
    
    try:
        data = await get_json(client, url, params=params)
        return data.get("textVersions", [])
    except Exception as e:
        print(f"Failed to fetch text versions for {bill_type.upper()} {bill_number}: {e}")
        return []

async def fetch_bill_cosponsors(client: httpx.AsyncClient, congress: int, 
                              bill_type: str, bill_number: str) -> List[Dict[str, Any]]:
    """Fetch bill cosponsors."""
    url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}/{bill_number}/cosponsors"
    params = {"api_key": API_KEY, "limit": 250}
    
    try:
        data = await get_json(client, url, params=params)
        return data.get("cosponsors", [])
    except Exception as e:
        print(f"Failed to fetch cosponsors for {bill_type.upper()} {bill_number}: {e}")
        return []

# ============================ Processing Functions ============================

def extract_bill_info(bill_data: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and normalize bill information."""
    # Handle case where bill_data might be a string or None
    if not isinstance(bill_data, dict):
        print(f"Warning: Expected dict but got {type(bill_data)}: {bill_data}")
        return {
            "congress": None,
            "bill_type": "",
            "bill_number": "",
            "title": None,
            "introduced_date": None,
            "latest_action": None,
            "public_url": None,
            "sponsor": {},
            "policy_area": None,
            "subjects": []
        }
    
    return {
        "congress": bill_data.get("congress"),
        "bill_type": (bill_data.get("type", "") or "").lower(),
        "bill_number": str(bill_data.get("number", "")),
        "title": bill_data.get("title"),
        "introduced_date": to_date(bill_data.get("introducedDate")),
        "latest_action": bill_data.get("latestAction"),
        "public_url": bill_data.get("url"),
        "sponsor": bill_data.get("sponsors", [{}])[0] if bill_data.get("sponsors") else {},
        "policy_area": bill_data.get("policyArea", {}).get("name") if bill_data.get("policyArea") else None,
        "subjects": [s.get("name") for s in bill_data.get("subjects", []) if isinstance(s, dict) and s.get("name")]
    }

async def process_bill(pool: asyncpg.Pool, client: httpx.AsyncClient, 
                      bill_summary: Dict[str, Any], fetch_details: bool = True) -> bool:
    """Process a single bill and store in database."""
    
    # Extract basic info from summary
    congress = bill_summary.get("congress")
    bill_type = (bill_summary.get("type", "") or "").lower()
    bill_number = str(bill_summary.get("number", ""))
    
    if not all([congress, bill_type, bill_number]):
        print(f"Skipping bill with missing info: {bill_summary}")
        return False
    
    print(f"Processing {bill_type.upper()} {bill_number}...")
    
    # Get detailed info if requested
    if fetch_details:
        try:
            detailed_bill = await fetch_bill_details(client, congress, bill_type, bill_number)
            if detailed_bill:
                bill_info = extract_bill_info(detailed_bill)
            else:
                print(f"No detailed data returned for {bill_type.upper()} {bill_number}, using summary")
                bill_info = extract_bill_info(bill_summary)
        except Exception as e:
            print(f"Failed to fetch details for {bill_type.upper()} {bill_number}: {e}")
            bill_info = extract_bill_info(bill_summary)
    else:
        bill_info = extract_bill_info(bill_summary)
    
    # Store bill in database
    async with pool.acquire() as conn:
        async with conn.transaction():
            await conn.execute(
                BILLS_UPSERT,
                bill_info["congress"],
                bill_info["bill_type"],
                bill_info["bill_number"],
                bill_info["title"],
                bill_info["introduced_date"],
                json.dumps(bill_info["latest_action"]) if bill_info["latest_action"] else None,
                bill_info["public_url"]
            )
            
            # Fetch and store text versions
            if fetch_details:
                try:
                    text_versions = await fetch_bill_text_versions(client, congress, bill_type, bill_number)
                    for tv in text_versions:
                        version_type = tv.get("type")
                        url = None
                        
                        # Find PDF or HTML format
                        for fmt in tv.get("formats", []):
                            if fmt.get("type") in ("PDF", "HTML") and fmt.get("url"):
                                url = fmt["url"]
                                break
                        
                        if version_type and url:
                            await conn.execute(
                                BILL_TEXT_VERSIONS_UPSERT,
                                congress, bill_type, bill_number, version_type, url
                            )
                except Exception as e:
                    print(f"Failed to process text versions for {bill_type.upper()} {bill_number}: {e}")
    
    return True

# ============================ Main Functions ============================

async def ingest_recent_bills(congress: int, *, limit: int = 500, 
                            fetch_details: bool = True, workers: int = 3):
    """Ingest recently updated bills."""
    if not API_KEY or not DATABASE_URL:
        raise SystemExit("Missing CONGRESS_API_KEY or DATABASE_URL")
    
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        print(f"Fetching {limit} most recently updated bills from Congress {congress}...")
        
        # Fetch bills in batches
        all_bills = []
        offset = 0
        batch_size = 250  # API limit
        
        while len(all_bills) < limit:
            remaining = limit - len(all_bills)
            current_batch_size = min(batch_size, remaining)
            
            bills_batch = await fetch_bills_list(
                client, congress, 
                limit=current_batch_size, 
                offset=offset,
                sort="updateDate+desc"
            )
            
            if not bills_batch:
                break
                
            all_bills.extend(bills_batch)
            offset += len(bills_batch)
            
            print(f"Fetched {len(all_bills)} bills so far...")
            
            if len(bills_batch) < current_batch_size:
                break  # No more bills available
        
        print(f"Processing {len(all_bills)} bills with {workers} workers...")
        
        # Process bills concurrently
        sem = asyncio.Semaphore(workers)
        processed = 0
        
        async def worker(bill_summary):
            nonlocal processed
            async with sem:
                success = await process_bill(pool, client, bill_summary, fetch_details)
                if success:
                    processed += 1
                    if processed % 10 == 0:
                        print(f"Processed {processed}/{len(all_bills)} bills...")
        
        await asyncio.gather(*(worker(bill) for bill in all_bills), return_exceptions=True)
        
        print(f"✅ Successfully processed {processed} bills!")
    
    await pool.close()

async def ingest_bills_by_type(congress: int, bill_types: List[str], *, 
                             limit_per_type: int = 100, fetch_details: bool = True):
    """Ingest bills filtered by type (hr, s, hjres, etc.)."""
    if not API_KEY or not DATABASE_URL:
        raise SystemExit("Missing CONGRESS_API_KEY or DATABASE_URL")
    
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
    timeout = httpx.Timeout(connect=10.0, read=30.0, write=10.0, pool=10.0)
    
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        for bill_type in bill_types:
            print(f"Fetching {limit_per_type} {bill_type.upper()} bills...")
            
            # Fetch bills of this type
            url = f"{BASE_URL}/bill/{congress}/{bill_type.lower()}"
            params = {
                "api_key": API_KEY,
                "limit": limit_per_type,
                "sort": "updateDate+desc"
            }
            
            try:
                data = await get_json(client, url, params=params)
                bills = data.get("bills", [])
                
                print(f"Processing {len(bills)} {bill_type.upper()} bills...")
                
                for bill in bills:
                    await process_bill(pool, client, bill, fetch_details)
                    
            except Exception as e:
                print(f"Failed to fetch {bill_type.upper()} bills: {e}")
    
    await pool.close()

# ============================ CLI ============================

def main():
    parser = argparse.ArgumentParser(description="Ingest bills from Congress API")
    parser.add_argument("--congress", type=int, required=True, help="Congress number (e.g., 119)")
    parser.add_argument("--mode", choices=["recent", "by-type"], default="recent",
                       help="Ingestion mode")
    parser.add_argument("--limit", type=int, default=500,
                       help="Number of bills to fetch (for recent mode)")
    parser.add_argument("--bill-types", nargs="+", default=["hr", "s"],
                       help="Bill types to fetch (for by-type mode)")
    parser.add_argument("--limit-per-type", type=int, default=100,
                       help="Bills per type (for by-type mode)")
    parser.add_argument("--workers", type=int, default=3,
                       help="Concurrent workers")
    parser.add_argument("--no-details", action="store_true",
                       help="Skip fetching detailed bill info (faster)")
    
    args = parser.parse_args()
    
    fetch_details = not args.no_details
    
    if args.mode == "recent":
        asyncio.run(ingest_recent_bills(
            args.congress,
            limit=args.limit,
            fetch_details=fetch_details,
            workers=args.workers
        ))
    elif args.mode == "by-type":
        asyncio.run(ingest_bills_by_type(
            args.congress,
            args.bill_types,
            limit_per_type=args.limit_per_type,
            fetch_details=fetch_details
        ))

if __name__ == "__main__":
    main()