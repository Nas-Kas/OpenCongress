
#!/usr/bin/env python3
import os, sys, argparse, textwrap
from typing import Any, Dict, Optional, List
try:
    import requests
except ImportError:
    print("Install dependency: pip install requests", file=sys.stderr)
    sys.exit(1)

API_BASE = "https://api.congress.gov/v3"

def get_api_key(cli_key: Optional[str]) -> str:
    return cli_key or os.getenv("CONGRESS_KEY") or sys.exit("Set CONGRESS_KEY or pass --api-key.")

def fetch_json(url: str) -> Dict[str, Any]:
    r = requests.get(url, headers={"Accept":"application/json"}, timeout=30)
    try:
        r.raise_for_status()
    except Exception as e:
        print(r.text[:400], file=sys.stderr)
        raise
    return r.json()

def extract_vote_obj(v: Dict[str, Any]) -> Dict[str, Any]:
    # Support both spellings/shapes
    if "houseRollCallMemberVotes" in v:
        arr = v.get("houseRollCallMemberVotes") or []
        return arr[0] if arr else {}
    if "houseRollCallVoteMemberVotes" in v:
        # In this shape, the object is nested directly under this key
        obj = v.get("houseRollCallVoteMemberVotes") or {}
        return obj
    # Fallback: try a single top-level object
    return v

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--congress", type=int, required=True)
    ap.add_argument("--session", type=int, required=True)
    ap.add_argument("--vote", type=int, required=True)
    ap.add_argument("--api-key", default=None)
    args = ap.parse_args()

    key = get_api_key(args.api_key)

    hv_url = f"{API_BASE}/house-vote/{args.congress}/{args.session}/{args.vote}/members?api_key={key}"
    data = fetch_json(hv_url)

    vote_obj = extract_vote_obj(data)
    if not vote_obj:
        print(f"Unexpected response keys: {list(data.keys())}", file=sys.stderr)
        sys.exit(2)

    legislation_type = (vote_obj.get("legislationType") or "").lower()
    legislation_number = str(vote_obj.get("legislationNumber"))
    congress = vote_obj.get("congress", args.congress)

    if not legislation_type or not legislation_number or legislation_number == "None":
        print("Could not find legislationType/legislationNumber in vote payload.", file=sys.stderr)
        print("Top-level keys:", list(vote_obj.keys()), file=sys.stderr)
        sys.exit(3)

    bill_url = f"{API_BASE}/bill/{congress}/{legislation_type}/{legislation_number}?api_key={key}"
    bill = fetch_json(bill_url).get("bill", {})

    print("Bill:", legislation_type.upper(), legislation_number, "Congress", congress)
    print("Title:", bill.get("title"))
    la = bill.get("latestAction") or {}
    print("Latest Action:", la.get("actionDate"), "-", la.get("text"))

if __name__ == "__main__":
    main()
