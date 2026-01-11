"""Business logic for member operations with optimized connection handling."""
from typing import Optional, List
from backend.utils.formatters import normalize_position, to_iso

class MemberService:
    def __init__(self, member_repo):
        self.member_repo = member_repo
    
    async def get_member_profile(self, bioguide_id: str) -> Optional[dict]:
        return await self.member_repo.get_member_by_bioguide(bioguide_id)
    
    async def get_member_voting_history(
        self,
        bioguide_id: str,
        congress: int,
        session: int,
        limit: int = 150,
        offset: int = 0,
        search: Optional[str] = None
    ) -> dict:
        """Fetch profile and votes using a single shared database connection."""
        async with self.member_repo.pool.acquire() as conn:
            # Fetch Profile
            profile = await self.member_repo.get_member_by_bioguide(bioguide_id, conn=conn)
            
            # Fetch Votes
            votes = await self.member_repo.get_member_votes(
                bioguide_id, congress, session, limit, offset, search, conn=conn
            )
        
        votes_out = []
        for v in votes:
            votes_out.append({
                **v,
                "started": to_iso(v["started"]),
                "position": normalize_position(v["position"]),
                "counts": {
                    "yea": v["yeaCount"] or 0,
                    "nay": v["nayCount"] or 0,
                    "present": v["presentCount"] or 0,
                    "notVoting": v["notVotingCount"] or 0,
                }
            })
        
        stats = {
            "total": len(votes_out),
            "yea": sum(1 for v in votes_out if v["position"] == "Yea"),
            "nay": sum(1 for v in votes_out if v["position"] == "Nay"),
            "present": sum(1 for v in votes_out if v["position"] == "Present"),
            "notVoting": sum(1 for v in votes_out if v["position"] == "Not Voting"),
        }
        
        return {
            "profile": profile or {"bioguideId": bioguide_id, "name": bioguide_id},
            "congress": congress,
            "session": session,
            "limit": limit,
            "offset": offset,
            "stats": stats,
            "votes": votes_out,
        }
    
    async def search_members(self, query: str, limit: int = 10) -> List[dict]:
        return await self.member_repo.search_members(query, limit)