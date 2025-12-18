"""Database queries for bills."""
import asyncpg
from typing import Optional, List


class BillRepository:
    """Repository for bill-related database operations."""
    
    def __init__(self, pool: asyncpg.Pool):
        self.pool = pool
    
    async def get_bill(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> Optional[dict]:
        """Get bill details."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT congress, bill_type, bill_number, title, introduced_date, 
                       latest_action, public_url
                FROM bills
                WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
                """,
                congress, bill_type.lower(), bill_number
            )
        return dict(row) if row else None
    
    async def get_bill_text_versions(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> List[dict]:
        """Get bill text versions (PDFs, HTML)."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT version_type, url
                FROM bill_text_versions
                WHERE congress=$1 AND bill_type=$2 AND bill_number=$3
                ORDER BY version_type
                """,
                congress, bill_type.lower(), bill_number
            )
        return [dict(r) for r in rows]
    
    async def get_bill_votes(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> List[dict]:
        """Get all House votes for a bill."""
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT session, roll, question, result, started,
                       yea_count, nay_count, present_count, not_voting_count,
                       legislation_url
                FROM house_votes
                WHERE congress=$1
                  AND legislation_type ILIKE $2
                  AND legislation_number=$3
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
        search: Optional[str] = None
    ) -> tuple[List[dict], int]:
        """Get bills that haven't been voted on yet."""
        where_clause = "WHERE hv.congress IS NULL AND b.congress = $1"
        params = [congress]
        
        if bill_type:
            where_clause += " AND b.bill_type = $" + str(len(params) + 1)
            params.append(bill_type.lower())
        
        if search:
            # Search in bill number or title
            search_term = f"%{search}%"
            where_clause += f" AND (b.bill_number ILIKE ${len(params) + 1} OR b.title ILIKE ${len(params) + 1})"
            params.append(search_term)
        
        query = f"""
            SELECT 
                b.congress,
                b.bill_type,
                b.bill_number,
                b.title,
                b.introduced_date,
                b.latest_action,
                b.public_url,
                b.updated_at
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
        params.extend([limit, offset])
        
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
        
        async with self.pool.acquire() as conn:
            rows = await conn.fetch(query, *params)
            total = await conn.fetchval(count_query, *params[:-2])
        
        return [dict(r) for r in rows], total
    
    async def get_cached_summary(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> Optional[dict]:
        """Get cached bill summary."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT summary, created_at FROM bill_summaries WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
        return dict(row) if row else None
    
    async def cache_summary(
        self,
        congress: int,
        bill_type: str,
        bill_number: str,
        summary: dict
    ):
        """Cache a bill summary."""
        import json
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO bill_summaries (congress, bill_type, bill_number, summary)
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (congress, bill_type, bill_number)
                DO UPDATE SET summary = $4, updated_at = now()
                """,
                congress, bill_type, bill_number, json.dumps(summary)
            )
    
    async def get_bill_chunk_count(
        self,
        congress: int,
        bill_type: str,
        bill_number: str
    ) -> int:
        """Get count of embedded chunks for RAG."""
        async with self.pool.acquire() as conn:
            count = await conn.fetchval(
                "SELECT COUNT(*) FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
        return count or 0
