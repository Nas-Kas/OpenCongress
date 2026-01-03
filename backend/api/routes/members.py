"""Member-related API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
import asyncpg

from services.member_service import MemberService
from repositories.member_repository import MemberRepository
from api.dependencies import get_db_pool


router = APIRouter(tags=["members"])


@router.get("/member/{bioguideId}")
async def get_member_detail(
    bioguideId: str,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Get member profile by bioguide ID."""
    member_repo = MemberRepository(pool)
    member_service = MemberService(member_repo)
    
    member = await member_service.get_member_profile(bioguideId)
    
    if not member:
        raise HTTPException(404, "Member not found in database")
    
    return member


@router.get("/member/{bioguideId}/house-votes")
async def get_member_house_votes(
    bioguideId: str,
    congress: int = Query(..., description="e.g., 119 or 118"),
    session: int = Query(1, description="1 or 2"),
    limit: int = Query(150, ge=1, le=500, description="how many recent roll calls to return"),
    offset: int = 0,
    search: Optional[str] = Query(None, description="Search bill titles, numbers, or roll numbers"),
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Get member's recent House votes with statistics."""
    member_repo = MemberRepository(pool)
    member_service = MemberService(member_repo)
    
    result = await member_service.get_member_voting_history(
        bioguideId, congress, session, limit, offset, search
    )
    
    # If no votes found in requested congress, search for their most recent votes
    if not result["votes"]:
        # Query to find which congress/session this member has votes in
        member_repo = MemberRepository(pool)
        most_recent = await member_repo.get_member_most_recent_votes(bioguideId, limit=1)
        
        if most_recent:
            # Found votes in a different congress
            fallback_congress = most_recent[0]["congress"]
            fallback_session = most_recent[0]["session"]
            
            fallback_result = await member_service.get_member_voting_history(
                bioguideId, fallback_congress, fallback_session, window, offset
            )
            
            if fallback_result["votes"]:
                fallback_result["note"] = f"No votes found in Congress {congress}, Session {session}. Showing votes from Congress {fallback_congress}, Session {fallback_session}."
                return fallback_result
    
    return result


@router.get("/search/members")
async def search_members(
    q: str = Query(..., min_length=1, description="Name, Bioguide ID, state, party"),
    limit: int = Query(10, ge=1, le=50),
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Search for members by name, bioguide ID, state, or party."""
    if not q.strip():
        return []
    
    member_repo = MemberRepository(pool)
    member_service = MemberService(member_repo)
    
    return await member_service.search_members(q, limit)
