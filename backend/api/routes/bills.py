"""Bill-related API endpoints."""
from fastapi import APIRouter, Query, HTTPException, Depends
from typing import Optional
from pydantic import BaseModel
import asyncpg
import asyncio
import os
import re
from dotenv import load_dotenv

from backend.services.bill_service import BillService
from backend.repositories.bill_repository import BillRepository
from backend.api.dependencies import get_db_pool
from backend.bill_text_scraper import BillTextScraper
from backend.gemini_bill_summarizer import GeminiBillSummarizer
from backend.bill_rag_embedder import BillRAGEmbedder

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
                dt = cached.get('createdAt')
                response["cached_at"] = dt.isoformat() if hasattr(dt, 'isoformat') else str(dt)   
                return response
        
        # Get text versions to find a PDF
        text_versions = await bill_repo.get_bill_text_versions(congress, bill_type, bill_number)
        
        # Define the summary generation task
        async def generate_summary_task():
            # Strategy A: Use Gemini if PDF is available
            if GEMINI_API_KEY:
                pdf_url = None
                for version in text_versions:
                    if version.get('url') and version['url'].endswith('.pdf'):
                        pdf_url = version['url']
                        break
                
                if pdf_url:
                    print(f"DEBUG: Using Gemini for PDF: {pdf_url}")
                    gemini_summarizer = GeminiBillSummarizer(GEMINI_API_KEY)
                    # Run synchronous PDF processing in a separate thread
                    result = await asyncio.to_thread(
                        gemini_summarizer.summarize_bill_from_url, 
                        pdf_url, congress, bill_type, bill_number
                    )
                    
                    if result and result.get('success'):
                        # Important: Unpack 'summary_data' so the rest of the method works
                        return {
                            'title': result.get('title'),
                            'url': result.get('source_url'),
                            'length': result.get('text_length'),
                            'scraped_at': result.get('scraped_at')
                        }, result.get('summary_data', {})
            
            # Fallback to traditional text scraper
            print("DEBUG: Falling back to text scraper")
            scraper = BillTextScraper(API_KEY)
            bill_data = await asyncio.to_thread(scraper.get_bill_text, congress, bill_type, bill_number)
            
            if not bill_data or not bill_data.get('text'):
                raise HTTPException(404, "Could not fetch bill text from congress.gov")
            
            summary_data = scraper.generate_summary(bill_data['text'], bill_data['title'])
            return bill_data, summary_data
        
        # Run the task with timeout
        try:
            bill_data, summary_data = await asyncio.wait_for(
                generate_summary_task(),
                timeout=300.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(408, "Summary generation timed out")
        
        # Format the response data
        response_data = {
            "success": True,
            "cached": False,
            "bill_info": {
                "congress": congress,
                "bill_type": bill_type,
                "bill_number": bill_number,
                "title": bill_data.get('title', 'Unknown Title'),
                "source_url": bill_data.get('url'),
                "text_length": bill_data.get('length', 0)
            },
            "generated_at": bill_data.get('scraped_at')
        }
        
        # Align keys between Gemini (tldr) and Scraper (summary)
        if 'tldr' in summary_data:
            response_data.update({
                "tldr": summary_data['tldr'],
                "keyPoints": summary_data.get('keyPoints', []),
                "financialInfo": summary_data.get('financialInfo', "Not specified"),
                "importance": summary_data.get('importance', 3),
                "readingTime": summary_data.get('readingTime', "Unknown"),
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        else:
            response_data.update({
                "tldr": summary_data.get('summary', "Summary unavailable"),
                "keyPoints": [phrase['context'][:100] + "..." for phrase in summary_data.get('key_phrases', [])[:5]],
                "financialInfo": _format_financial_info(summary_data.get('financial_info', {})),
                "importance": 3,
                "readingTime": f"{summary_data.get('estimated_reading_time', 1)} min",
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        
        if response_data.get('tldr') and response_data['tldr'].strip():
            await bill_repo.cache_summary(congress, bill_type, bill_number, response_data)
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"CRITICAL ERROR: {str(e)}")
        raise HTTPException(500, f"Error generating summary: {str(e)}")
    """Generate AI-powered bill summary with caching."""
    import asyncio
    import json
    
    bill_repo = BillRepository(pool)
    
    try:
        # Check cache unless force_refresh is True
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
        
        # Check if bill metadata/versions exist in DB
        text_versions = await bill_repo.get_bill_text_versions(congress, bill_type, bill_number)
        
        async def generate_summary_task():
            # Try Gemini via PDF URL first
            if GEMINI_API_KEY:
                pdf_url = None
                # Look for a PDF version in the database records
                for version in text_versions:
                    if version.get('url') and version['url'].endswith('.pdf'):
                        pdf_url = version['url']
                        break
                
                if pdf_url:
                    print(f"DEBUG: Found PDF URL in DB: {pdf_url}")
                    gemini_summarizer = GeminiBillSummarizer(GEMINI_API_KEY)
                    # Run synchronous PDF processing in a separate thread to avoid blocking
                    result = await asyncio.to_thread(
                        gemini_summarizer.summarize_bill_from_url, 
                        pdf_url, congress, bill_type, bill_number
                    )
                    
                    if result and result.get('success'):
                        # Flatten the Gemini response to match our expected schema
                        summary_flat = result.get('summary_data', {})
                        bill_meta = {
                            'title': result.get('title', f"{bill_type.upper()} {bill_number}"),
                            'url': result.get('source_url', pdf_url),
                            'length': result.get('text_length', 0),
                            'scraped_at': result.get('scraped_at')
                        }
                        return bill_meta, summary_flat

            #  Fallback to local text scraper (if no PDF or no Gemini)
            print("DEBUG: Falling back to local scraper...")
            scraper = BillTextScraper(API_KEY)
            # Run synchronous scraping in a separate thread
            bill_data = await asyncio.to_thread(scraper.get_bill_text, congress, bill_type, bill_number)
            
            if not bill_data or not bill_data.get('text'):
                raise HTTPException(404, "Could not fetch bill text for analysis")
            
            # Scraper uses a slightly different method name: generate_summary
            summary_data = scraper.generate_summary(bill_data['text'], bill_data['title'])
            return bill_data, summary_data

        # Execute the task with a 5-minute timeout (important for large bills)
        try:
            bill_data, summary_data = await asyncio.wait_for(
                generate_summary_task(),
                timeout=300.0
            )
        except asyncio.TimeoutError:
            raise HTTPException(408, "Summary generation timed out - the bill may be exceptionally large")

        # Format the final response to ensure all keys required by UI exist
        response_data = {
            "success": True,
            "cached": False,
            "bill_info": {
                "congress": congress,
                "bill_type": bill_type,
                "bill_number": bill_number,
                "title": bill_data.get('title', 'Unknown Title'),
                "source_url": bill_data.get('url'),
                "text_length": bill_data.get('length', 0)
            },
            "generated_at": bill_data.get('scraped_at')
        }
        
        # Merge AI analysis into top-level of response_data
        # We handle both the Gemini 'tldr' key and the Scraper 'summary' key here
        if 'tldr' in summary_data:
            response_data.update({
                "tldr": summary_data['tldr'],
                "keyPoints": summary_data.get('keyPoints', []),
                "financialInfo": summary_data.get('financialInfo', "Not specified"),
                "importance": summary_data.get('importance', 3),
                "readingTime": summary_data.get('readingTime', "Unknown"),
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        else:
            # Traditional Scraper structure
            response_data.update({
                "tldr": summary_data.get('summary', "Summary unavailable"),
                "keyPoints": [p['context'][:150] + "..." for p in summary_data.get('key_phrases', [])[:5]],
                "financialInfo": str(summary_data.get('financial_info', "None")),
                "importance": 3,
                "readingTime": f"{summary_data.get('estimated_reading_time', 1)} min",
                "analysis": {
                    "key_phrases": summary_data.get('key_phrases', [])[:10],
                    "sections": summary_data.get('sections', [])[:5],
                    "word_count": summary_data.get('word_count', 0),
                    "estimated_reading_time": summary_data.get('estimated_reading_time', 1)
                }
            })
        
        # Cache the successful result
        if response_data.get('tldr'):
            await bill_repo.cache_summary(congress, bill_type, bill_number, response_data)
        
        return response_data
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"CRITICAL ERROR in generate_bill_summary: {str(e)}")
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
    background: bool = True,  # Run as background job by default for large bills
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Embed a bill for RAG queries.
    
    - force: If True, re-embed even if chunks already exist
    - background: If True, run as background job (recommended for large bills)
    
    Returns job_id if background=True, otherwise waits for completion.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    bill_repo = BillRepository(pool)
    
    try:
        # Get PDF URL
        pdf_url = request.pdf_url
        
        if not pdf_url:
            text_versions = await bill_repo.get_bill_text_versions(congress, bill_type, bill_number)
            for version in text_versions:
                if version['url'] and version['url'].endswith('.pdf'):
                    pdf_url = version['url']
                    break
            
            if not pdf_url:
                raise HTTPException(404, "No PDF URL found for this bill in database")
        
        # Check for existing job
        from background_jobs import get_or_create_job, EmbeddingJobManager, run_embedding_job
        
        existing_job_id = await get_or_create_job(congress, bill_type, bill_number, pool)
        if existing_job_id:
            return {
                "job_id": existing_job_id,
                "status": "already_running",
                "message": f"Embedding job {existing_job_id} is already running for this bill."
            }
        
        if background:
            # Create job
            job_manager = EmbeddingJobManager(pool)
            job_id = await job_manager.create_job(congress, bill_type, bill_number)
            
            # Start background task with error handling
            async def run_with_error_handling():
                try:
                    await run_embedding_job(
                        job_id, congress, bill_type, bill_number, pdf_url,
                        GEMINI_API_KEY, pool, force
                    )
                except Exception as e:
                    print(f"Background job {job_id} failed with error: {e}")
                    import traceback
                    traceback.print_exc()
                    await job_manager.complete_job(job_id, success=False, error=str(e))
            
            asyncio.create_task(run_with_error_handling())
            
            return {
                "job_id": job_id,
                "status": "started",
                "message": "Embedding job started. Use /embed-status/{job_id} to check progress.",
                "poll_url": f"/embed-status/{job_id}"
            }
        else:
            # Run synchronously (not recommended for large bills)
            embedder = BillRAGEmbedder(GEMINI_API_KEY, pool)
            await embedder.embed_bill(congress, bill_type, bill_number, pdf_url, force=force)
            
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
        print(error_detail)
        raise HTTPException(500, f"Error embedding bill: {str(e)}")


@router.get("/embed-status/{job_id}")
async def get_embed_status(
    job_id: int,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Get the status of an embedding job.
    
    Returns progress information including:
    - status: pending, processing, completed, failed
    - pages_processed / total_pages
    - chunks_embedded
    - map_summaries_done
    - reduce_done
    """
    from background_jobs import EmbeddingJobManager
    
    job_manager = EmbeddingJobManager(pool)
    status = await job_manager.get_job_status(job_id)
    
    if not status:
        raise HTTPException(404, "Job not found")
    
    # Calculate progress percentage
    progress_pct = 0
    if status['total_pages'] and status['total_pages'] > 0:
        progress_pct = int((status['pages_processed'] or 0) / status['total_pages'] * 100)
    
    return {
        "job_id": job_id,
        "status": status['status'],
        "progress": {
            "total_pages": status['total_pages'],
            "pages_processed": status['pages_processed'] or 0,
            "chunks_embedded": status['chunks_embedded'] or 0,
            "map_summaries_done": status['map_summaries_done'] or 0,
            "reduce_done": status['reduce_done'] or False,
            "percentage": progress_pct
        },
        "error": status['error_message'],
        "started_at": status['started_at'].isoformat() if status['started_at'] else None,
        "completed_at": status['completed_at'].isoformat() if status['completed_at'] else None
    }


@router.post("/bill/{congress}/{bill_type}/{bill_number}/generate-hierarchical-summary")
async def generate_hierarchical_summary(
    congress: int,
    bill_type: str,
    bill_number: str,
    pool: asyncpg.Pool = Depends(get_db_pool)
):
    """
    Generate hierarchical summary for a large bill (map-reduce approach).
    Bill must be embedded first.
    """
    if not GEMINI_API_KEY:
        raise HTTPException(500, "Missing GEMINI_API_KEY")
    
    bill_repo = BillRepository(pool)
    
    try:
        # Check if bill is embedded
        chunk_count = await bill_repo.get_bill_chunk_count(congress, bill_type, bill_number)
        if chunk_count == 0:
            raise HTTPException(404, "Bill has not been embedded yet. Please embed it first.")
        
        # Generate hierarchical summary
        from hierarchical_summarizer import HierarchicalSummarizer
        
        summarizer = HierarchicalSummarizer(GEMINI_API_KEY, pool)
        
        # Map step
        await summarizer.generate_bucket_summaries(congress, bill_type, bill_number)
        
        # Reduce step
        summary_data = await summarizer.generate_final_summary(congress, bill_type, bill_number)
        
        if not summary_data:
            raise HTTPException(500, "Failed to generate summary")
        
        return {
            "success": True,
            "summary": summary_data,
            "method": "hierarchical"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        import traceback
        error_detail = f"Error generating hierarchical summary: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)
        raise HTTPException(500, f"Error generating summary: {str(e)}")


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
