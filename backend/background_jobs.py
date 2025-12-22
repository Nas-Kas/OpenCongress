"""
Background Job Manager for Long-Running Embedding Tasks
Handles large bills that exceed request timeouts
"""
import asyncpg
import asyncio
from typing import Optional
from datetime import datetime

from bill_rag_embedder import BillRAGEmbedder
from hierarchical_summarizer import HierarchicalSummarizer


class EmbeddingJobManager:
    """Manage long-running embedding jobs for large bills."""
    
    def __init__(self, db_pool: asyncpg.Pool):
        self.pool = db_pool
    
    async def create_job(
        self,
        congress: int,
        bill_type: str,
        bill_number: str,
        total_pages: Optional[int] = None
    ) -> int:
        """
        Create a new embedding job.
        
        Returns:
            job_id: Unique identifier for the job
        """
        async with self.pool.acquire() as conn:
            job_id = await conn.fetchval(
                """
                INSERT INTO bill_embedding_jobs
                  (congress, bill_type, bill_number, status, total_pages)
                VALUES ($1, $2, $3, 'pending', $4)
                RETURNING job_id
                """,
                congress, bill_type, bill_number, total_pages
            )
        return job_id
    
    async def get_job_status(self, job_id: int) -> Optional[dict]:
        """Get current job status and progress."""
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT job_id, congress, bill_type, bill_number, status,
                       total_pages, pages_processed, chunks_embedded,
                       map_summaries_done, reduce_done, error_message,
                       started_at, completed_at
                FROM bill_embedding_jobs
                WHERE job_id = $1
                """,
                job_id
            )
        return dict(row) if row else None
    
    async def update_status(
        self,
        job_id: int,
        status: str,
        error_message: Optional[str] = None
    ):
        """Update job status."""
        async with self.pool.acquire() as conn:
            if status in ('completed', 'failed'):
                await conn.execute(
                    """
                    UPDATE bill_embedding_jobs
                    SET status = $2, completed_at = now(), error_message = $3
                    WHERE job_id = $1
                    """,
                    job_id, status, error_message
                )
            else:
                await conn.execute(
                    """
                    UPDATE bill_embedding_jobs
                    SET status = $2, error_message = $3
                    WHERE job_id = $1
                    """,
                    job_id, status, error_message
                )
    
    async def complete_job(self, job_id: int, success: bool, error: Optional[str] = None):
        """Mark job as completed or failed."""
        status = 'completed' if success else 'failed'
        await self.update_status(job_id, status, error)


async def run_embedding_job(
    job_id: int,
    congress: int,
    bill_type: str,
    bill_number: str,
    pdf_url: str,
    api_key: str,
    db_pool: asyncpg.Pool,
    force: bool = False
):
    """
    Run the complete embedding pipeline as a background job.
    
    Steps:
    1. Embed bill chunks with page metadata
    2. Generate bucket summaries (map step)
    3. Generate final summary (reduce step)
    """
    job_manager = EmbeddingJobManager(db_pool)
    
    try:
        print(f"\n{'='*60}")
        print(f"Starting embedding job {job_id}")
        print(f"Bill: {congress}/{bill_type}/{bill_number}")
        print(f"{'='*60}\n")
        
        # Update status to processing
        await job_manager.update_status(job_id, 'processing')
        print(f"[Job {job_id}] Status updated to 'processing'")
        
        # Step 1: Embed bill chunks
        print(f"[Job {job_id}] Step 1: Embedding bill chunks...")
        embedder = BillRAGEmbedder(api_key, db_pool)
        await embedder.embed_bill(
            congress, bill_type, bill_number, pdf_url,
            force=force, batch_size=64, job_id=job_id
        )
        print(f"[Job {job_id}] Step 1 completed successfully")
        
        # Step 2: Generate bucket summaries (map step)
        print(f"[Job {job_id}] Step 2: Generating bucket summaries...")
        summarizer = HierarchicalSummarizer(api_key, db_pool)
        await summarizer.generate_bucket_summaries(
            congress, bill_type, bill_number, job_id=job_id
        )
        print(f"[Job {job_id}] Step 2 completed successfully")
        
        # Step 3: Generate final summary (reduce step)
        print(f"[Job {job_id}] Step 3: Generating final comprehensive summary...")
        await summarizer.generate_final_summary(
            congress, bill_type, bill_number, job_id=job_id
        )
        print(f"[Job {job_id}] Step 3 completed successfully")
        
        # Mark as completed
        print(f"[Job {job_id}] Marking job as completed...")
        await job_manager.complete_job(job_id, success=True)
        print(f"[Job {job_id}] Job marked as completed in database")
        
        print(f"\n{'='*60}")
        print(f"✓ Job {job_id} completed successfully!")
        print(f"{'='*60}\n")
        
    except Exception as e:
        error_msg = f"Job failed: {str(e)}"
        print(f"\n{'='*60}")
        print(f"✗ Job {job_id} failed: {e}")
        print(f"{'='*60}\n")
        
        import traceback
        traceback.print_exc()
        
        try:
            await job_manager.complete_job(job_id, success=False, error=error_msg)
            print(f"[Job {job_id}] Job marked as failed in database")
        except Exception as db_error:
            print(f"[Job {job_id}] Failed to mark job as failed: {db_error}")
        
        raise


async def get_or_create_job(
    congress: int,
    bill_type: str,
    bill_number: str,
    db_pool: asyncpg.Pool
) -> Optional[int]:
    """
    Check if there's an existing pending/processing job for this bill.
    If so, return its job_id. Otherwise, return None.
    
    Only returns a job if it was started within the last 30 minutes.
    Older stuck jobs are ignored to allow retries.
    """
    from datetime import datetime, timedelta
    
    async with db_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT job_id, status, started_at
            FROM bill_embedding_jobs
            WHERE congress = $1 AND bill_type = $2 AND bill_number = $3
              AND status IN ('pending', 'processing')
              AND started_at > now() - interval '30 minutes'
            ORDER BY started_at DESC
            LIMIT 1
            """,
            congress, bill_type, bill_number
        )
    
    return row['job_id'] if row else None
