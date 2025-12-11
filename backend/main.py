"""
FastAPI application - main entry point.

This file contains:
- App initialization
- Middleware configuration
- Route registration
- Startup/shutdown events
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
from dotenv import load_dotenv

# Import route modules
from api.routes import votes, members, bills

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS", 
    "http://localhost:3000,http://127.0.0.1:3000"
).split(",")

if not DATABASE_URL:
    raise RuntimeError("Missing DATABASE_URL in .env")

# Initialize FastAPI app
app = FastAPI(
    title="Congressional Data API",
    description="API for congressional bills, votes, and members with AI-powered analysis",
    version="2.0.0"
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


@app.on_event("startup")
async def startup():
    """Initialize database connection pool on startup."""
    app.state.pool = await asyncpg.create_pool(
        DATABASE_URL, 
        min_size=1, 
        max_size=10
    )
    print("✓ Database connection pool initialized")


@app.on_event("shutdown")
async def shutdown():
    """Close database connection pool on shutdown."""
    await app.state.pool.close()
    print("✓ Database connection pool closed")


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "status": "ok",
        "service": "Congressional Data API",
        "version": "2.0.0",
        "features": [
            "House roll-call votes",
            "Member voting records",
            "Bill tracking and analysis",
            "AI-powered bill summaries",
            "RAG-based bill Q&A"
        ]
    }


@app.get("/health")
async def health_check():
    """Detailed health check with database connectivity."""
    try:
        async with app.state.pool.acquire() as conn:
            await conn.fetchval("SELECT 1")
        return {
            "status": "healthy",
            "database": "connected",
            "version": "2.0.0"
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "database": "disconnected",
            "error": str(e)
        }
