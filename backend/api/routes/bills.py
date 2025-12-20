"""Bill-related API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
import asyncpg
import os
import re
from dotenv import load_dotenv

from services.bill_service import BillService
from repositories.bill_repository import BillRepository
from api.dependencies import get_db_pool
from bill_text_scraper import BillTextScraper
from gemini_bill_summarizer import GeminiBillSummarizer
from bill_rag_embedder import BillRAGEmbedder

# Load environment variables
load_dotenv()

router = APIRouter(tags=["bills"])

# Get environment variables
API_KEY = os.getenv("CONGRESS_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
BASE_URL = os.getenv("BASE_URL", "https://api.congress.gov/v3")


@router.get("/bills/no-votes")
async def get_bills_without_votes(
    congress: int = Query(119, description="Congress number"),
    limit: int = Query(50, description="Number of bills to return"),
    offset: int = Query(0, description="Offset for pagination"),
    bill_type: Optional[str] = Query(None, description="Filter by bill type (hr, s, etc.)"),
    search: Optional[str] = Query(None, description="Search by bill number or title"),
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Get bills that haven't had House votes yet."""
    bill_repo = BillRepository(pool)
    bill_service = BillService(bill_repo)
    
    return await bill_service.get_bills_without_votes(congress, bill_type, limit, offset, search)


@router.get("/bill/{congress}/{bill_type}/{bill_number}")
async def get_bill_view(
    congress: int,
    bill_type: str,
    bill_number: str,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Get bill details with all House roll calls."""
    bill_repo = BillRepository(pool)
    bill_service = BillService(bill_repo)
    
    return await bill_service.get_bill_view(congress, bill_type, bill_number)


def _strip_html(s: str | None) -> str:
    """Strip HTML tags from string."""
    if not s:
        return ""
    s = re.sub(r"<[^>]+>", " ", s)
    return re.sub(r"\s+", " ", s).strip()


@router.get("/bill/{congress}/{bill_type}/{bill_number}/summaries")
async def bill_summaries(congress: int, bill_type: str, bill_number: str):
    """Get official bill summaries from Congress API."""
    if not API_KEY:
        raise HTTPException(500, "Missing CONGRESS_API_KEY")
    
    import httpx
    bill_type = bill_type.lower()
    url = f"{BASE_URL}/bill/{congress}/{bill_type}/{bill_number}/summaries"
    
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, params={"api_key": API_KEY})
            resp.raise_for_status()
            raw = resp.json() or {}
    except httpx.HTTPStatusError as e:
        raise HTTPException(e.response.status_code, f"Congress API error: {e}") from e
    except Exception as e:
        raise HTTPException(500, f"Failed to fetch summaries: {e}") from e
    
    out = []
    for s in raw.get("summaries") or []:
        out.append({
            "date": s.get("dateIssued") or s.get("actionDate") or (s.get("updateDate") or "")[:10],
            "source": s.get("source") or s.get("actionDesc") or "CRS",
            "text": _strip_html(s.get("text") or s.get("summary")),
        })
    return {"summaries": out}


def _format_financial_info(financial_info: dict) -> str:
    """Format financial information for display."""
    parts = []
    
    if financial_info.get('appropriations'):
        parts.append(f"Appropriations: {len(financial_info['appropriations'])} items")
    
    if financial_info.get('authorizations'):
        parts.append(f"Authorizations: {len(financial_info['authorizations'])} items")
    
    if financial_info.get('penalties'):
        parts.append(f"Penalties/Fines: {len(financial_info['penalties'])} items")
    
    if not parts:
        return "No specific financial provisions identified"
    
    return "; ".join(parts)


@router.post("/bill/{congress}/{bill_type}/{bill_number}/generate-summary")
async def generate_bill_summary(
    congress: int,
    bill_type: str,
    bill_number: str,
    force_refresh: bool = False,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Generate AI-powered bill summary with caching."""
    import asyncio
    import json
    
    bill_repo = BillRepository(pool)
    
    try:
        # Check cache unless force_refresh
        if not force_refresh:
            cached = await bill_repo.get_cached_summary(congress, bill_type, bill_number)
            if cached:
                summary_data = cached['summary']
                if isinstance(summary_data, str):
                    summary_data = json.loads(summary_data)
                
                response = dict(summary_data)
                response["cached"] = True
                response["cached_at"] = cached['created_at'].isoformat()
                return response
        
        # Check if bill text exists
        text_versions = await bill_repo.get_bill_text_versions(congress, bill_type, bill_number)
        
        if not text_versions:
            bill = await bill_repo.get_bill(congress, bill_type, bill_number)
            if not bill:
                raise HTTPException(404, "Bill not found in database")
            else:
                raise HTTPException(404, "Bill text not available - no text versions found")
        
        # Generate summary
        async def generate_summary_task():
            # Try Gemini first if available
            if GEMINI_API_KEY:
                pdf_url = None
                for version in text_versions:
                    if version['url'] and version['url'].endswith('.pdf'):
                        pdf_url = version['url']
                        break
                
                if pdf_url:
                    gemini_summarizer = GeminiBillSummarizer(GEMINI_API_KEY)
                    result = gemini_summarizer.summarize_bill_from_url(pdf_url, congress, bill_type, bill_number)
                    
                    if result and result.get('success'):
                        return {
                            'title': result['title'],
                            'url': result['source_url'],
                            'length': result['text_length'],
                            'scraped_at': result['scraped_at']
                        }, result['summary_data']
            
            # Fallback to text scraper
            scraper = BillTextScraper(API_KEY)
            bill_data = scraper.get_bill_text(congress, bill_type, bill_number)
            
            if not bill_data:
                raise HTTPException(404, "Could not fetch bill text from congress.gov")
            
            summary_data = scraper.generate_summary(bill_data['text'], bill_data['title'])
            return bill_data, summary_data
        
        # Run with timeout
        try:
            bill_data, summary_data = await asyncio.wait_for(
                generate_summary_task(),
                timeout=300.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(408, "Summary generation timed out - bill may be too large")
        
        # Format response
        response_data = {
            "success": True,
            "cached": False,
            "bill_info": {
                "congress": congress,
                "bill_type": bill_type,
                "bill_number": bill_number,
                "title": bill_data['title'],
                "source_url": bill_data['url'],
                "text_length": bill_data['length']
            },
            "generated_at": bill_data['scraped_at']
        }
        
        # Handle Gemini vs traditional scraper response
        if 'tldr' in summary_data:
            response_data.update({
                "tldr": summary_data['tldr'],
                "keyPoints": summary_data['keyPoints'],
                "financialInfo": summary_data['financialInfo'],
                "importance": summary_data['importance'],
                "readingTime": summary_data['readingTime'],
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        else:
            response_data.update({
                "tldr": summary_data['summary'],
                "keyPoints": [phrase['context'][:100] + "..." if len(phrase['context']) > 100 else phrase['context']
                             for phrase in summary_data['key_phrases'][:5]],
                "financialInfo": _format_financial_info(summary_data['financial_info']),
                "importance": min(5, max(1, len(summary_data['key_phrases']) // 3 + 2)),
                "readingTime": f"{summary_data['estimated_reading_time']} minute{'s' if summary_data['estimated_reading_time'] != 1 else ''}",
                "analysis": {
                    "key_phrases": summary_data['key_phrases'][:10],
                    "sections": summary_data['sections'][:5],
                    "word_count": summary_data['word_count'],
                    "estimated_reading_time": summary_data['estimated_reading_time']
                }
            })
        
        # Cache if valid
        if response_data.get('tldr') and response_data['tldr'].strip():
            await bill_repo.cache_summary(congress, bill_type, bill_number, response_data)
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error generating summary: {str(e)}")


# === RAG SYSTEM ENDPOINTS ===

class EmbedBillRequest(BaseModel):
    pdf_url: str


class QueryBillRequest(BaseModel):
    question: str
    top_k: Optional[int] = 8


@router.post("/bill/{congress}/{bill_type}/{bill_number}/embed")
async def embed_bill(
    congress: int,
    bill_type: str,
    bill_number: str,
    request: EmbedBillRequest,
    force: bool = False,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Embed a bill for RAG queries.
    
    - force: If True, re-embed even if chunks already exist (useful for fixing partial embeddings)
    """
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    bill_repo = BillRepository(pool)
    
    try:
        pdf_url = request.pdf_url
        
        if not pdf_url:
            text_versions = await bill_repo.get_bill_text_versions(congress, bill_type, bill_number)
            for version in text_versions:
                if version['url'] and version['url'].endswith('.pdf'):
                    pdf_url = version['url']
                    break
            
            if not pdf_url:
                raise HTTPException(404, "No PDF URL found for this bill in database")
        
        embedder = BillRAGEmbedder(GEMINI_API_KEY, pool)
        # Process in batches of 100 chunks to avoid timeouts
        await embedder.embed_bill(congress, bill_type, bill_number, pdf_url, force=force, batch_size=100)
        
        chunk_count = await bill_repo.get_bill_chunk_count(congress, bill_type, bill_number)
        
        return {
            "success": True,
            "congress": congress,
            "bill_type": bill_type,
            "bill_number": bill_number,
            "chunks": chunk_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error embedding bill: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)  # Log to console
        raise HTTPException(500, f"Error embedding bill: {str(e)}")


@router.get("/bill/{congress}/{bill_type}/{bill_number}/embedding-status")
async def get_embedding_status(
    congress: int,
    bill_type: str,
    bill_number: str,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Check if a bill has been embedded for RAG queries (lightweight check)."""
    bill_repo = BillRepository(pool)
    
    try:
        chunk_count = await bill_repo.get_bill_chunk_count(congress, bill_type, bill_number)
        
        return {
            "is_embedded": chunk_count > 0,
            "chunk_count": chunk_count
        }
    except Exception as e:
        raise HTTPException(500, f"Error checking embedding status: {str(e)}")


@router.post("/bill/{congress}/{bill_type}/{bill_number}/ask")
async def query_bill(
    congress: int,
    bill_type: str,
    bill_number: str,
    request: QueryBillRequest,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """Ask a question about a bill using RAG."""
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    bill_repo = BillRepository(pool)
    
    try:
        chunk_count = await bill_repo.get_bill_chunk_count(congress, bill_type, bill_number)
        
        if chunk_count == 0:
            raise HTTPException(404, "Bill has not been embedded yet. Please embed it first.")
        
        embedder = BillRAGEmbedder(GEMINI_API_KEY, pool)
        answer = await embedder.query_bill(
            congress, bill_type, bill_number,
            request.question, request.top_k
        )
        
        return {
            "success": True,
            "question": request.question,
            "answer": answer,
            "chunks_used": request.top_k,
            "total_chunks": chunk_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Error querying bill: {str(e)}")
