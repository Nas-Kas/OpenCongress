"""
FastAPI application - main entry point.
"""
import asyncio
from contextlib import asynccontextmanager
from typing import List
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
from dotenv import load_dotenv

# Import route modules
from backend.api.routes import votes, members, bills

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", 
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL in environment variables")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Handles startup and shutdown logic.
    Using a timeout here prevents the 'No open ports' hang on Render.
    """
    print("--> Starting application lifespan...")
    try:
        print(f"--> Connecting to database at {DATABASE_URL.split('@')[-1]}...")
        
        app.state.pool = await asyncio.wait_for(
            asyncpg.create_pool(
                DATABASE_URL, 
                min_size=1, 
                max_size=5,
                command_timeout=60,
                statement_cache_size=0,
                server_settings={'search_path': 'public,extensions'}
            ),
            timeout=10.0
        )
        print("✓ Database connection pool initialized")
    except asyncio.TimeoutError:
        print("✗ CRITICAL: Database connection timed out after 10 seconds.")
        raise RuntimeError("Database connection timeout during startup")
    except Exception as e:
        print(f"✗ CRITICAL: Database initialization failed: {e}")
        raise e

    yield

    if hasattr(app.state, "pool"):
        await app.state.pool.close()
        print("✓ Database connection pool closed")

app = FastAPI(
    title="Congressional Data API",
    description="API for congressional bills, votes, and members",
    version="2.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(votes.router)
app.include_router(members.router)
app.include_router(bills.router)

# --- Standard Endpoints ---
@app.get("/")
async def root():
    """Basic health check for Render."""
    return {
        "status": "ok",
        "service": "Congressional Data API",
        "version": "2.0.0"
    }


@app.get("/health")
async def health_check():
    """Deep health check verifying database connectivity."""
    try:
        async with app.state.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {
            "status": "healthy",
            "database": "connected"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }