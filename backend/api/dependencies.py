"""FastAPI dependencies for dependency injection."""
from fastapi import Request
import asyncpg


async def get_db_pool(request: Request) -> asyncpg.Pool:
    """Get database connection pool from app state."""
    return request.app.state.pool
