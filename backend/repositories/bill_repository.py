"""Database queries for bills with shared connection support and camelCase output."""
import asyncpg
import time
from typing import Optional, List, Tuple

class BillRepository:
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_bill(self, congress: int, bill_type: str, bill_number: str, conn=None) -> Optional[dict]:
        if conn:
            return await self._get_bill_exec(conn, congress, bill_type, bill_number)
        async with self.pool.acquire() as new_conn:
            return await self._get_bill_exec(new_conn, congress, bill_type, bill_number)

    async def _get_bill_exec(self, conn, congress, bill_type, bill_number):
        row = await conn.fetchrow(
            """
            SELECT 
                congress, 
                bill_type AS "billType", 
                bill_number AS "billNumber", 
                title, 
                introduced_date AS "introducedDate", 
                latest_action AS "latestAction", 
                public_url AS "publicUrl"
            FROM bills
            WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
            """,
            congress, bill_type.lower(), bill_number
        )
        return dict(row) if row else None

    async def get_bill_text_versions(self, congress: int, bill_type: str, bill_number: str, conn=None) -> List[dict]:
        if conn:
            return await self._get_versions_exec(conn, congress, bill_type, bill_number)
        async with self.pool.acquire() as new_conn:
            return await self._get_versions_exec(new_conn, congress, bill_type, bill_number)

    async def _get_versions_exec(self, conn, congress, bill_type, bill_number):
        rows = await conn.fetch(
            """
            SELECT 
                version_type AS "versionType", 
                url
            FROM bill_text_versions
            WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
            ORDER BY version_type DESC
            """,
            congress, bill_type.lower(), bill_number
        )
        return [dict(r) for r in rows]

    async def get_bill_votes(self, congress: int, bill_type: str, bill_number: str, conn=None) -> List[dict]:
        if conn:
            return await self._get_votes_exec(conn, congress, bill_type, bill_number)
        async with self.pool.acquire() as new_conn:
            return await self._get_votes_exec(new_conn, congress, bill_type, bill_number)

    async def _get_votes_exec(self, conn, congress, bill_type, bill_number):
        rows = await conn.fetch(
            """
            SELECT 
                session, roll, question, result, started,
                yea_count AS "yeaCount", 
                nay_count AS "nayCount", 
                present_count AS "presentCount", 
                not_voting_count AS "notVotingCount",
                legislation_url AS "legislationUrl"
            FROM house_votes
            WHERE congress=$1
              AND (
                (legislation_type ILIKE $2 AND legislation_number = $3)
                OR
                (subject_bill_type ILIKE $2 AND subject_bill_number = $3)
              )
            ORDER BY started ASC NULLS LAST, roll ASC
            """,
            congress, bill_type, bill_number
        )
        return [dict(r) for r in rows]

    async def get_bills_without_votes(
        self,
        congress: int,
        bill_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None,
        conn=None
    ) -> Tuple[List[dict], int]:
        if conn:
            return await self._get_bills_without_votes_exec(conn, congress, bill_type, limit, offset, search)
        async with self.pool.acquire() as new_conn:
            return await self._get_bills_without_votes_exec(new_conn, congress, bill_type, limit, offset, search)

    async def _get_bills_without_votes_exec(self, conn, congress, bill_type, limit, offset, search):
        t0 = time.time()
        print(f"[QUERY] get_bills_without_votes: congress={congress}, type={bill_type}, limit={limit}")
        
        where_clause = "WHERE hv.congress IS NULL AND b.congress = $1"
        params = [congress]
        
        if bill_type:
            where_clause += " AND b.bill_type = $" + str(len(params) + 1)
            params.append(bill_type.lower())
        
        if search:
            search_term = f"%{search}%"
            where_clause += f" AND (b.bill_number ILIKE ${len(params) + 1} OR b.title ILIKE ${len(params) + 1})"
            params.append(search_term)
        
        query = f"""
            SELECT 
                b.congress, 
                b.bill_type AS "billType", 
                b.bill_number AS "billNumber", 
                b.title, 
                b.introduced_date AS "introducedDate", 
                b.latest_action AS "latestAction", 
                b.public_url AS "publicUrl", 
                b.updated_at AS "updatedAt"
            FROM bills b
            LEFT JOIN house_votes hv ON (
                hv.congress = b.congress 
                AND LOWER(hv.legislation_type) = b.bill_type 
                AND hv.legislation_number = b.bill_number
            )
            {where_clause}
            ORDER BY b.updated_at DESC
            LIMIT ${len(params) + 1} OFFSET ${len(params) + 2}
        """
        
        count_query = f"""
            SELECT COUNT(*)
            FROM bills b
            LEFT JOIN house_votes hv ON (
                hv.congress = b.congress 
                AND LOWER(hv.legislation_type) = b.bill_type 
                AND hv.legislation_number = b.bill_number
            )
            {where_clause}
        """
        
        print(f"[QUERY] Fetching rows...")
        rows = await conn.fetch(query, *params, limit, offset)
        print(f"[QUERY] Rows fetched in {time.time() - t0:.2f}s")
        
        print(f"[QUERY] Fetching count...")
        total = await conn.fetchval(count_query, *params)
        print(f"[QUERY] Count completed in {time.time() - t0:.2f}s total")
        
        return [dict(r) for r in rows], (total or 0)

    async def get_cached_summary(self, congress: int, bill_type: str, bill_number: str, conn=None) -> Optional[dict]:
        if conn:
            return await self._get_summary_exec(conn, congress, bill_type, bill_number)
        async with self.pool.acquire() as new_conn:
            return await self._get_summary_exec(new_conn, congress, bill_type, bill_number)

    async def _get_summary_exec(self, conn, congress, bill_type, bill_number):
        row = await conn.fetchrow(
            """
            SELECT 
                summary, 
                created_at AS "createdAt"
            FROM bill_summaries 
            WHERE congress = $1 AND bill_type = $2 AND bill_number = $3
            """,
            congress, bill_type.lower(), bill_number
        )
        return dict(row) if row else None

    async def get_bill_chunk_count(self, congress: int, bill_type: str, bill_number: str, conn=None) -> int:
        if conn:
            return await self._get_chunk_exec(conn, congress, bill_type, bill_number)
        async with self.pool.acquire() as new_conn:
            return await self._get_chunk_exec(new_conn, congress, bill_type, bill_number)

    async def _get_chunk_exec(self, conn, congress, bill_type, bill_number):
        count = await conn.fetchval(
            """
            SELECT COUNT(*) 
            FROM bill_chunks 
            WHERE congress = $1 AND bill_type = $2 AND bill_number = $3
            """,
            congress, bill_type.lower(), bill_number
        )
        return count or 0

    async def cache_summary(self, congress: int, bill_type: str, bill_number: str, summary_data: dict, conn=None):
        """Saves or updates a bill summary in the database."""
        import json
        
        summary_json = json.dumps(summary_data)
        
        sql = """
            INSERT INTO bill_summaries (congress, bill_type, bill_number, summary, created_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (congress, bill_type, bill_number) 
            DO UPDATE SET 
                summary = EXCLUDED.summary,
                created_at = CURRENT_TIMESTAMP
        """
        
        if conn:
            await conn.execute(sql, congress, bill_type.lower(), bill_number, summary_json)
        else:
            async with self.pool.acquire() as new_conn:
                await new_conn.execute(sql, congress, bill_type.lower(), bill_number, summary_json)