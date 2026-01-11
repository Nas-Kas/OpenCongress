"""Business logic for vote operations."""
from typing import Optional, List
from backend.repositories.vote_repository import VoteRepository
from backend.utils.formatters import normalize_position, to_iso


class VoteService:
    """Service layer for vote-related operations."""
    
    def __init__(self, vote_repo: VoteRepository):
        self.vote_repo = vote_repo
    
    async def list_votes(
        self,
        congress: int,
        session: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
        include_titles: bool = True,
        search: Optional[str] = None
    ) -> List[dict]:
        """Get formatted list of votes."""
        rows = await self.vote_repo.get_votes_by_congress(
            congress, session, limit, offset, include_titles, search
        )
        
        return [{
            "congress": r["congress"],
            "session": r["session"],
            "roll": r["roll"],
            "question": r["question"] or None,
            "result": r["result"],
            "started": to_iso(r["started"]),
            "legislationType": r["legislation_type"],
            "legislationNumber": r["legislation_number"],
            "subjectBillType": r["subject_bill_type"],
            "subjectBillNumber": r["subject_bill_number"],
            "source": r["source"],
            "legislationUrl": r["legislation_url"] or r["source"], 
            "title": r["title"] if include_titles else None,
            "yeaCount": r["yea_count"],
            "nayCount": r["nay_count"],
            "presentCount": r["present_count"],
            "notVotingCount": r["not_voting_count"],
        } for r in rows]

    async def get_vote_detail(
        self,
        congress: int,
        session: int,
        roll: int
    ) -> Optional[dict]:
        """Get complete vote details with members and counts."""
        hv = await self.vote_repo.get_vote_detail(congress, session, roll)
        if not hv:
            return None
        
        ballots = await self.vote_repo.get_vote_members(congress, session, roll)
        
        # Calculate counts from ballots if available, otherwise fallback to stored counts
        if ballots:
            counts = {
                "total": len(ballots),
                "yea": sum(1 for b in ballots if normalize_position(b["position"]) == "Yea"),
                "nay": sum(1 for b in ballots if normalize_position(b["position"]) == "Nay"),
                "present": sum(1 for b in ballots if normalize_position(b["position"]) == "Present"),
                "notVoting": sum(1 for b in ballots if normalize_position(b["position"]) == "Not Voting"),
            }
        else:
            counts = {
                "total": (hv.get("yea_count") or 0) + (hv.get("nay_count") or 0) + 
                         (hv.get("present_count") or 0) + (hv.get("not_voting_count") or 0),
                "yea": hv.get("yea_count") or 0,
                "nay": hv.get("nay_count") or 0,
                "present": hv.get("present_count") or 0,
                "notVoting": hv.get("not_voting_count") or 0,
            }
        
        # Format member votes
        rows = [{
            "bioguideId": b["bioguide_id"],
            "name": b["name"] or b["bioguide_id"],
            "state": b["state"],
            "party": b["party"],
            "position": normalize_position(b["position"]),
            "imageUrl": b.get("image_url")
        } for b in ballots]
        
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
            "started": to_iso(hv["started"]),
        }
        
        return {
            "meta": meta,
            "counts": counts,
            "votes": rows,
            "bill": None 
        }
