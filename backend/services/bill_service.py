"""Service layer for bill operations."""
from typing import Optional, List, Dict, Any

class BillService:
    """Service for handling bill-related logic."""
    
    def __init__(self, bill_repo):
        self.bill_repo = bill_repo

    async def get_bill_view(
        self, 
        congress: int, 
        bill_type: str, 
        bill_number: str
    ) -> Optional[Dict[str, Any]]:
        """
        Orchestrates the data for the full bill view.
        Uses a single connection for all repository calls.
        """
        # Acquire ONE connection from the pool for the entire request
        async with self.bill_repo.pool.acquire() as conn:
            # Pass the 'conn' object to every repository method
            bill = await self.bill_repo.get_bill(
                congress, bill_type, bill_number, conn=conn
            )
            
            if not bill:
                return None

            # Fetch versions
            versions = await self.bill_repo.get_bill_text_versions(
                congress, bill_type, bill_number, conn=conn
            )
            
            # CRITICAL: Nest the versions inside the bill dictionary 
            # using the key 'textVersions' to match React frontend logic
            bill["textVersions"] = versions
            
            votes = await self.bill_repo.get_bill_votes(
                congress, bill_type, bill_number, conn=conn
            )
            summary = await self.bill_repo.get_cached_summary(
                congress, bill_type, bill_number, conn=conn
            )
            chunk_count = await self.bill_repo.get_bill_chunk_count(
                congress, bill_type, bill_number, conn=conn
            )

            return {
                "bill": bill,
                "votes": votes,
                "summary": summary,
                "embedding_status": {
                    "is_embedded": chunk_count > 0,
                    "chunk_count": chunk_count
                }
            }

    async def get_bills_without_votes(
        self,
        congress: int,
        bill_type: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
        search: Optional[str] = None
    ) -> Dict[str, Any]:
        """Fetch bills that haven't been voted on with total count."""
        rows, total = await self.bill_repo.get_bills_without_votes(
            congress, bill_type, limit, offset, search
        )
        
        return {
            "bills": rows,
            "total": total,
            "limit": limit,
            "offset": offset
        }

    async def get_bill_with_versions(
        self, 
        congress: int, 
        bill_type: str, 
        bill_number: str
    ) -> Optional[Dict[str, Any]]:
        """Internal helper for specific bill data."""
        async with self.bill_repo.pool.acquire() as conn:
            bill = await self.bill_repo.get_bill(
                congress, bill_type, bill_number, conn=conn
            )
            if bill:
                # Ensuring consistency with textVersions key here as well
                bill["textVersions"] = await self.bill_repo.get_bill_text_versions(
                    congress, bill_type, bill_number, conn=conn
                )
            return bill