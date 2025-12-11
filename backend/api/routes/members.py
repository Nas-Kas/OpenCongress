"""Member-related API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends
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
    window: int = Query(150, ge=1, le=500, description="how many recent roll calls to scan"),
    offset: int = 0,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Get member's recent House votes with statistics."""
    member_repo = MemberRepository(pool)
    member_service = MemberService(member_repo)
    
    result = await member_service.get_member_voting_history(
        bioguideId, congress, session, window, offset
    )
    
    if not result["votes"]:
        raise HTTPException(404, "No member votes found in database")
    
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
