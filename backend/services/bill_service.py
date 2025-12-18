"""Business logic for bill operations."""
from typing import Optional, List
import json
from repositories.bill_repository import BillRepository
from utils.formatters import to_iso


class BillService:
    """Service layer for bill-related operations."""
    
    def __init__(self, bill_repo: BillRepository):
        self.bill_repo = bill_repo
    
    async def get_bill_with_versions(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> Optional[dict]:
        """Get bill with text versions."""
        bill = await self.bill_repo.get_bill(congress, bill_type, bill_number)
        if not bill:
            return None
        
        text_versions = await self.bill_repo.get_bill_text_versions(
            congress, bill_type, bill_number
        )
        
        return {
            "congress": bill["congress"],
            "billType": bill["bill_type"],
            "billNumber": bill["bill_number"],
            "title": bill["title"],
            "introducedDate": to_iso(bill["introduced_date"]),
            "latestAction": bill["latest_action"],
            "publicUrl": bill["public_url"],
            "textVersions": [{"type": tv["version_type"], "url": tv["url"]} for tv in text_versions],
        }
    
    async def get_bill_view(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> dict:
        """Get complete bill view with votes."""
        bill = await self.get_bill_with_versions(congress, bill_type, bill_number)
        votes = await self.bill_repo.get_bill_votes(congress, bill_type, bill_number)
        
        # Format votes
        votes_out = []
        for v in votes:
            yea = v["yea_count"] or 0
            nay = v["nay_count"] or 0
            present = v["present_count"] or 0
            nv = v["not_voting_count"] or 0
            votes_out.append({
                "session": v["session"],
                "roll": v["roll"],
                "question": v["question"],
                "result": v["result"],
                "started": to_iso(v["started"]),
                "counts": {
                    "yea": yea,
                    "nay": nay,
                    "present": present,
                    "notVoting": nv,
                    "total": yea + nay + present + nv
                },
                "legislationUrl": v["legislation_url"],
            })
        
        return {
            "bill": bill or {
                "congress": congress,
                "billType": bill_type.lower(),
                "billNumber": str(bill_number),
                "title": None,
                "introducedDate": None,
                "latestAction": None,
                "publicUrl": None,
                "textVersions": [],
            },
            "votes": votes_out,
        }
    
    async def get_bills_without_votes(
        self,
        congress: int,
        bill_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None
    ) -> dict:
        """Get bills that haven't been voted on."""
        rows, total = await self.bill_repo.get_bills_without_votes(
            congress, bill_type, limit, offset, search
        )
        
        bills = []
        for r in rows:
            # Parse latest_action JSON if it's a string
            latest_action = r["latest_action"]
            if isinstance(latest_action, str):
                try:
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
            "total": total,
            "offset": offset,
            "hasMore": offset + limit < total
        }
