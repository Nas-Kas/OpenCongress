"""Database queries for members."""
import asyncpg
from typing import Optional, List
import re


class MemberRepository:
    """Repository for member-related database operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_member_by_bioguide(self, bioguide_id: str) -> Optional[dict]:
        """Get member profile by bioguide ID."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT bioguide_id, name, party, state, image_url FROM members WHERE bioguide_id=$1",
                bioguide_id.upper()
            )
        return dict(row) if row else None
    
    async def get_member_votes(
        self,
        bioguide_id: str,
        congress: int,
        session: int,
        limit: int = 150,
        offset: int = 0
    ) -> List[dict]:
        """Get member's voting history with bill details."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT
                  hvm.roll,
                  hv.legislation_type, hv.legislation_number,
                  hv.subject_bill_type, hv.subject_bill_number,
                  hv.question, hv.result, hv.started,
                  hvm.position,
                  hv.legislation_url,
                  hv.yea_count, hv.nay_count, hv.present_count, hv.not_voting_count,
                  b.title
                FROM house_vote_members hvm
                JOIN house_votes hv
                  ON hv.congress=hvm.congress AND hv.session=hvm.session AND hv.roll=hvm.roll
                LEFT JOIN bills b
                  ON b.congress=hv.congress AND b.bill_type=LOWER(hv.legislation_type) 
                  AND b.bill_number=hv.legislation_number
                WHERE hvm.bioguide_id=$1 AND hv.congress=$2 AND hv.session=$3
                ORDER BY hv.started DESC NULLS LAST, hvm.roll DESC
                LIMIT $4 OFFSET $5
                """,
                bioguide_id.upper(), congress, session, limit, offset
            )
        return [dict(r) for r in rows]
    
    async def search_members(self, query: str, limit: int = 10) -> List[dict]:
        """Search members by name, bioguide ID, state, or party."""
        # Prevent wildcard-injection
        safe = re.sub(r"[%_]", " ", query.strip())
        pattern = f"%{safe}%"
        
        async with self.pool.acquire() as conn:
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
                  (CASE WHEN bioguide_id ILIKE $2 THEN 0
                        WHEN name ILIKE $3 THEN 1
                        ELSE 2 END),
                  name ASC
                LIMIT $4
                """,
                pattern,
                safe,
                f"{safe}%",
                limit
            )
        return [dict(r) for r in rows]
