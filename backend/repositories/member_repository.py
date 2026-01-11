"""Database queries for members with shared connection and camelCase support."""
import asyncpg
from typing import Optional, List
import re

class MemberRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_member_by_bioguide(self, bioguide_id: str, conn=None) -> Optional[dict]:
        """Get member profile by bioguide ID."""
        if conn:
            return await self._get_member_exec(conn, bioguide_id)
        async with self.pool.acquire() as new_conn:
            return await self._get_member_exec(new_conn, bioguide_id)

    async def _get_member_exec(self, conn, bioguide_id):
        row = await conn.fetchrow(
            """
            SELECT bioguide_id AS "bioguideId", name, party, state, image_url AS "imageUrl" 
            FROM members WHERE bioguide_id=$1
            """,
            bioguide_id.upper()
        )
        return dict(row) if row else None
    
    async def get_member_votes(
        self,
        bioguide_id: str,
        congress: int,
        session: int,
        limit: int = 150,
        offset: int = 0,
        search: Optional[str] = None,
        conn=None
    ) -> List[dict]:
        """Get member's voting history. Uses DISTINCT to prevent duplicate React keys."""
        if conn:
            return await self._get_votes_exec(conn, bioguide_id, congress, session, limit, offset, search)
        async with self.pool.acquire() as new_conn:
            return await self._get_votes_exec(new_conn, bioguide_id, congress, session, limit, offset, search)

    async def _get_votes_exec(self, conn, bioguide_id, congress, session, limit, offset, search):
        rows = await conn.fetch(
            """
            SELECT DISTINCT
              -- Create a unique ID for React keys: congress-session-roll
              (hv.congress || '-' || hv.session || '-' || hv.roll) AS "voteId",
              hv.congress,
              hv.session,
              hvm.roll,
              hv.legislation_type AS "legislationType", 
              hv.legislation_number AS "legislationNumber",
              hv.subject_bill_type AS "subjectBillType", 
              hv.subject_bill_number AS "subjectBillNumber",
              hv.question, hv.result, hv.started,
              hvm.position,
              hv.legislation_url AS "legislationUrl",
              hv.yea_count AS "yeaCount", 
              hv.nay_count AS "nayCount", 
              hv.present_count AS "presentCount", 
              hv.not_voting_count AS "notVotingCount",
              b.title
            FROM house_vote_members hvm
            JOIN house_votes hv
              ON hv.congress=hvm.congress AND hv.session=hvm.session AND hv.roll=hvm.roll
            LEFT JOIN bills b
              ON b.congress=hv.congress 
              AND (
                (LOWER(b.bill_type) = LOWER(hv.legislation_type)
                 AND b.bill_number::text = hv.legislation_number::text)
                OR
                (hv.subject_bill_type IS NOT NULL
                 AND LOWER(b.bill_type) = LOWER(hv.subject_bill_type)
                 AND b.bill_number::text = hv.subject_bill_number::text)
              )
            WHERE hvm.bioguide_id=$1 AND hv.congress=$2 AND hv.session=$3
              AND (
                $6::text IS NULL OR $6::text = '' OR
                b.title ILIKE '%' || $6::text || '%' OR
                hv.legislation_number::text ILIKE '%' || $6::text || '%' OR
                hv.roll::text = $6::text OR
                hv.question ILIKE '%' || $6::text || '%'
              )
            ORDER BY hv.started DESC NULLS LAST, hvm.roll DESC
            LIMIT $4 OFFSET $5
            """,
            bioguide_id.upper(), congress, session, limit, offset, search
        )
        return [dict(r) for r in rows]
    
    async def search_members(self, query: str, limit: int = 10, conn=None) -> List[dict]:
        safe = re.sub(r"[%_]", " ", query.strip())
        pattern = f"%{safe}%"
        
        if conn:
            return await self._search_exec(conn, pattern, safe, limit)
        async with self.pool.acquire() as new_conn:
            return await self._search_exec(new_conn, pattern, safe, limit)

    async def _search_exec(self, conn, pattern, safe, limit):
        rows = await conn.fetch(
            """
            SELECT bioguide_id AS "bioguideId",
                   COALESCE(name, bioguide_id) AS name,
                   party, state, image_url AS "imageUrl"
            FROM members
            WHERE (name ILIKE $1 OR bioguide_id ILIKE $1 OR state ILIKE $1 OR party ILIKE $1)
            ORDER BY
              (CASE WHEN bioguide_id ILIKE $2 THEN 0
                    WHEN name ILIKE $3 THEN 1
                    ELSE 2 END),
              name ASC
            LIMIT $4
            """,
            pattern, safe, f"{safe}%", limit
        )
        return [dict(r) for r in rows]

    async def get_members_list(
        self,
        congress: Optional[int] = None,
        party: Optional[str] = None,
        state: Optional[str] = None,
        limit: int = 500,
        conn=None
    ) -> List[dict]:
        """Get list of members with optional filters for congress, party, and state."""
        if conn:
            return await self._get_members_list_exec(conn, congress, party, state, limit)
        async with self.pool.acquire() as new_conn:
            return await self._get_members_list_exec(new_conn, congress, party, state, limit)

    async def _get_members_list_exec(self, conn, congress, party, state, limit):
        # Build dynamic query based on filters
        if congress:
            # Filter by members who have votes in this congress
            query = """
                SELECT DISTINCT
                    m.bioguide_id AS "bioguideId",
                    m.name,
                    m.party,
                    m.state,
                    m.image_url AS "imageUrl"
                FROM members m
                JOIN house_vote_members hvm ON m.bioguide_id = hvm.bioguide_id
                WHERE hvm.congress = $1
            """
            params = [congress]
            param_idx = 2
        else:
            # No congress filter - return all members
            query = """
                SELECT
                    bioguide_id AS "bioguideId",
                    name,
                    party,
                    state,
                    image_url AS "imageUrl"
                FROM members
                WHERE 1=1
            """
            params = []
            param_idx = 1

        # Add party filter
        if party:
            query += f" AND m.party = ${param_idx}" if congress else f" AND party = ${param_idx}"
            params.append(party.upper())
            param_idx += 1

        # Add state filter
        if state:
            query += f" AND m.state = ${param_idx}" if congress else f" AND state = ${param_idx}"
            params.append(state.upper())
            param_idx += 1

        # Order and limit
        query += " ORDER BY name ASC"
        query += f" LIMIT ${param_idx}"
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]

    async def get_available_congresses(self, conn=None) -> List[int]:
        """Get list of congresses that have vote data."""
        if conn:
            return await self._get_congresses_exec(conn)
        async with self.pool.acquire() as new_conn:
            return await self._get_congresses_exec(new_conn)

    async def _get_congresses_exec(self, conn):
        rows = await conn.fetch(
            "SELECT DISTINCT congress FROM house_vote_members ORDER BY congress DESC"
        )
        return [r['congress'] for r in rows]

    async def get_available_states(self, conn=None) -> List[str]:
        """Get list of states that have members."""
        if conn:
            return await self._get_states_exec(conn)
        async with self.pool.acquire() as new_conn:
            return await self._get_states_exec(new_conn)

    async def _get_states_exec(self, conn):
        rows = await conn.fetch(
            "SELECT DISTINCT state FROM members WHERE state IS NOT NULL ORDER BY state ASC"
        )
        return [r['state'] for r in rows]

    async def get_member_most_recent_votes(self, bioguide_id: str, limit: int = 1, conn=None) -> List[dict]:
        if conn:
            return await self._get_recent_votes_exec(conn, bioguide_id, limit)
        async with self.pool.acquire() as new_conn:
            return await self._get_recent_votes_exec(new_conn, bioguide_id, limit)

    async def _get_recent_votes_exec(self, conn, bioguide_id, limit):
        rows = await conn.fetch(
            """
            SELECT DISTINCT hv.congress, hv.session, MAX(hv.started) as latest_vote
            FROM house_vote_members hvm
            JOIN house_votes hv
              ON hv.congress=hvm.congress AND hv.session=hvm.session AND hv.roll=hvm.roll
            WHERE hvm.bioguide_id=$1
            GROUP BY hv.congress, hv.session
            ORDER BY hv.congress DESC, hv.session DESC, latest_vote DESC
            LIMIT $2
            """,
            bioguide_id.upper(), limit
        )
        return [dict(r) for r in rows]