"""External API helper utilities."""
import httpx
from typing import Optional
from fastapi import HTTPException


async def get_json(url: str, params: dict | None = None) -> dict:
    """Fetch JSON from external API with error handling."""
    async with httpx.AsyncClient(timeout=25, follow_redirects=True) as client:
        r = await client.get(url, params=params or {})
        if r.status_code == 404:
            raise HTTPException(404, "Not found")
        r.raise_for_status()
        return r.json()


def pick_vote_block(payload: dict) -> dict:
    """Extract vote member block from Congress API response."""
    if "houseRollCallMemberVotes" in payload:
        mv = payload.get("houseRollCallMemberVotes")
        if isinstance(mv, list) and mv:
            return mv[0] or {}
        if isinstance(mv, dict):
            return mv
    if "houseRollCallVoteMemberVotes" in payload:
        vv = payload.get("houseRollCallVoteMemberVotes")
        if isinstance(vv, dict):
            return vv
    return {}
