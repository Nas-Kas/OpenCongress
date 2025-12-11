"""Business logic for member operations."""
from typing import Optional, List
from repositories.member_repository import MemberRepository
from utils.formatters import normalize_position, to_iso


class MemberService:
    """Service layer for member-related operations."""
    
    def __init__(self, member_repo: MemberRepository):
        self.member_repo = member_repo
    
    async def get_member_profile(self, bioguide_id: str) -> Optional[dict]:
        """Get formatted member profile."""
        member = await self.member_repo.get_member_by_bioguide(bioguide_id)
        if not member:
            return None
        
        return {
            "bioguideId": member["bioguide_id"],
            "name": member["name"] or bioguide_id,
            "party": member["party"],
            "state": member["state"],
            "imageUrl": member["image_url"],
        }
    
    async def get_member_voting_history(
        self,
        bioguide_id: str,
        congress: int,
        session: int,
        window: int = 150,
        offset: int = 0
    ) -> dict:
        """Get member's voting history with statistics."""
        profile = await self.member_repo.get_member_by_bioguide(bioguide_id)
        votes = await self.member_repo.get_member_votes(
            bioguide_id, congress, session, window, offset
        )
        
        # Format votes
        votes_out = [{
            "roll": v["roll"],
            "legislationType": v["legislation_type"],
            "legislationNumber": v["legislation_number"],
            "subjectBillType": v["subject_bill_type"],
            "subjectBillNumber": v["subject_bill_number"],
            "title": v["title"],
            "question": v["question"],
            "result": v["result"],
            "started": to_iso(v["started"]),
            "position": normalize_position(v["position"]),
            "partyAtVote": None,
            "stateAtVote": None,
            "legislationUrl": v["legislation_url"],
            "counts": {
                "yea": v["yea_count"] or 0,
                "nay": v["nay_count"] or 0,
                "present": v["present_count"] or 0,
                "notVoting": v["not_voting_count"] or 0,
            },
        } for v in votes]
        
        # Calculate statistics
        stats = {
            "total": len(votes_out),
            "yea": sum(1 for v in votes_out if v["position"] == "Yea"),
            "nay": sum(1 for v in votes_out if v["position"] == "Nay"),
            "present": sum(1 for v in votes_out if v["position"] == "Present"),
            "notVoting": sum(1 for v in votes_out if v["position"] == "Not Voting"),
        }
        
        # Format profile
        profile_out = {
            "bioguideId": (profile["bioguide_id"] if profile else bioguide_id),
            "name": (profile["name"] if profile else None) or bioguide_id,
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
    
    async def search_members(self, query: str, limit: int = 10) -> List[dict]:
        """Search for members."""
        members = await self.member_repo.search_members(query, limit)
        
        return [{
            "bioguideId": m["bioguide_id"],
            "name": m["name"],
            "party": m["party"],
            "state": m["state"],
            "imageUrl": m["image_url"],
        } for m in members]
