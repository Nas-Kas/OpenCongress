"""Database queries for votes."""
import asyncpg
from typing import Optional, List


class VoteRepository:
    """Repository for vote-related database operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_votes_by_congress(
        self,
        congress: int,
        session: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
        include_titles: bool = True
    ) -> List[dict]:
        """Get votes for a congress/session with optional bill titles."""
        async with self.pool.acquire() as conn:
            if session is None:
                rows = await conn.fetch(
                    """
                    SELECT hv.congress, hv.session, hv.roll,
                           hv.question, hv.result, hv.started,
                           hv.legislation_type, hv.legislation_number,
                           hv.subject_bill_type, hv.subject_bill_number,
                           hv.source, hv.legislation_url,
                           hv.yea_count, hv.nay_count, hv.present_count, hv.not_voting_count,
                           CASE WHEN $1 THEN b.title ELSE NULL END AS title
                    FROM house_votes hv
                    LEFT JOIN bills b
                      ON b.congress = hv.congress
                     AND b.bill_type = LOWER(hv.legislation_type)
                     AND CAST(b.bill_number AS TEXT) = CAST(hv.legislation_number AS TEXT)
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
                           hv.subject_bill_type, hv.subject_bill_number,
                           hv.source, hv.legislation_url,
                           hv.yea_count, hv.nay_count, hv.present_count, hv.not_voting_count,
                           CASE WHEN $1 THEN b.title ELSE NULL END AS title
                    FROM house_votes hv
                    LEFT JOIN bills b
                      ON b.congress = hv.congress
                     AND b.bill_type = LOWER(hv.legislation_type)
                     AND CAST(b.bill_number AS TEXT) = CAST(hv.legislation_number AS TEXT)
                    WHERE hv.congress = $2 AND hv.session = $3
                    ORDER BY hv.started DESC NULLS LAST, hv.roll DESC
                    LIMIT $4 OFFSET $5
                    """,
                    include_titles, congress, session, limit, offset
                )
        return [dict(r) for r in rows]
    
    async def get_vote_detail(
        self,
        congress: int,
        session: int,
        roll: int
    ) -> Optional[dict]:
        """Get detailed vote information including metadata."""
        async with self.pool.acquire() as conn:
            hv = await conn.fetchrow(
                "SELECT * FROM house_votes WHERE congress=$1 AND session=$2 AND roll=$3",
                congress, session, roll
            )
            if hv:
                return dict(hv)
        return None
    
    async def get_vote_members(
        self,
        congress: int,
        session: int,
        roll: int
    ) -> List[dict]:
        """Get all member votes for a specific roll call."""
        async with self.pool.acquire() as conn:
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
                """,
                congress, session, roll
            )
        return [dict(b) for b in ballots]
    
    async def check_ballots_exist(
        self,
        congress: int,
        session: int,
        roll: int
    ) -> bool:
        """Check if ballots exist for a vote."""
        async with self.pool.acquire() as conn:
            exists = await conn.fetchval(
                """
                SELECT 1
                FROM house_vote_members
                WHERE congress=$1 AND session=$2 AND roll=$3
                LIMIT 1
                """,
                congress, session, roll
            )
        return exists is not None
