"""Vote-related API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
import asyncpg

from backend.services.vote_service import VoteService
from backend.services.bill_service import BillService
from backend.repositories.vote_repository import VoteRepository
from backend.repositories.bill_repository import BillRepository
from backend.api.dependencies import get_db_pool


router = APIRouter(prefix="/house", tags=["votes"])


@router.get("/votes")
async def list_house_votes(
    congress: int = Query(..., description="e.g., 119"),
    session: Optional[int] = Query(None, description="e.g., 1 or 2"),
    limit: int = 50,
    offset: int = 0,
    search: Optional[str] = Query(None, description="Search bill titles, numbers, or roll numbers"),
    include_titles: bool = Query(True, description="Join bill titles from DB"),
    include_questions: bool = Query(True, description="(kept for compat; DB already has questions)"),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    """
    Compact list of House roll-call votes for a Congress (optionally a session).
    DB first; fallback to API if DB has no rows.
    """
    vote_repo = VoteRepository(pool)
    vote_service = VoteService(vote_repo)
    
    votes = await vote_service.list_votes(
        congress, session, limit, offset, include_titles, search
    )
    
    # TODO: Add API fallback if votes is empty and FALLBACK_TO_API is enabled
    
    return {"votes": votes}


@router.get("/vote-detail")
async def house_vote_detail(
    congress: int = Query(...),
    session: int = Query(...),
    roll: int = Query(...),
    pool: asyncpg.Pool = Depends(get_db_pool),
):
    """
    Everything the UI needs for one roll: ballots + counts + bill + meta.
    DB first; fallback to API if not found.
    """
    vote_repo = VoteRepository(pool)
    bill_repo = BillRepository(pool)
    vote_service = VoteService(vote_repo)
    bill_service = BillService(bill_repo)
    
    result = await vote_service.get_vote_detail(congress, session, roll)
    
    if not result:
        # TODO: Add API fallback if FALLBACK_TO_API is enabled
        raise HTTPException(404, "Vote not found in database")
    
    # Fetch bill details if legislation exists
    meta = result["meta"]
    if meta.get("legislationType") and meta.get("legislationNumber"):
        bill = await bill_service.get_bill_with_versions(
            congress,
            meta["legislationType"],
            meta["legislationNumber"]
        )
        
        if bill:
            # Add source URLs to bill
            bill["publicUrl"] = bill.get("publicUrl") or meta.get("legislationUrl") or meta.get("source")
            result["bill"] = bill
    
    return result
