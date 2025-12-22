"""
Bill RAG Embedder - Chunks and embeds bill text for semantic search
Supports large PDFs (3,000+ pages) with streaming processing
"""
import os
import asyncpg
import asyncio
from google import genai
import requests
from typing import List, Dict, Optional
import tempfile

from streaming_pdf_processor import StreamingPDFProcessor


class BillRAGEmbedder:
    def __init__(self, api_key: str, db_pool):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.db_pool = db_pool
        self.processor = StreamingPDFProcessor(
            chunk_chars=3500,  # ~875 tokens
            overlap_chars=600,  # ~150 tokens overlap
            bucket_size=50  # 50 pages per bucket for hierarchical summarization
        )
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for a single text using Gemini"""
        result = self.client.models.embed_content(
            model="models/text-embedding-004",
            contents=text
        )
        return result.embeddings[0].values
    
    def embed_texts_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Generate embeddings for multiple texts in one API call.
        Much more efficient than individual calls.
        """
        if not texts:
            return []
        
        result = self.client.models.embed_content(
            model="models/text-embedding-004",
            contents=texts
        )
        return [emb.values for emb in result.embeddings]
    
    async def embed_bill(
        self, 
        congress: int, 
        bill_type: str, 
        bill_number: str, 
        pdf_url: str, 
        force: bool = False, 
        batch_size: int = 64,
        job_id: Optional[int] = None
    ):
        """
        Download bill PDF, stream process it, embed chunks, and store in database.
        Handles bills of any size without memory issues.
        
        Args:
            congress: Congress number
            bill_type: Bill type (hr, s, etc.)
            bill_number: Bill number
            pdf_url: URL to PDF
            force: If True, re-embed even if chunks exist
            batch_size: Number of chunks to embed in each batch (32-128 recommended)
            job_id: Optional job ID for progress tracking
        """
        print(f"\n=== Embedding {bill_type.upper()} {bill_number} ===")
        
        # Check if already embedded (unless force=True)
        if not force:
            async with self.db_pool.acquire() as conn:
                existing = await conn.fetchval(
                    "SELECT COUNT(*) FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                    congress, bill_type, bill_number
                )
                if existing > 0:
                    print(f"Already embedded ({existing} chunks). Skipping. Use force=True to re-embed.")
                    return
        
        # Delete existing chunks if force=True
        if force:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                    congress, bill_type, bill_number
                )
                print("Deleted existing chunks for re-embedding")
        
        # Download PDF
        print(f"Downloading PDF from {pdf_url}")
        response = requests.get(pdf_url, timeout=120, stream=True)
        response.raise_for_status()
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            for chunk in response.iter_content(chunk_size=8192):
                temp_file.write(chunk)
            temp_path = temp_file.name
        
        try:
            # Get total pages
            total_pages = self.processor.get_total_pages(temp_path)
            print(f"PDF has {total_pages} pages")
            
            # Update job if provided
            if job_id:
                await self._update_job_progress(job_id, total_pages=total_pages)
            
            # Stream process PDF into chunks
            print("Streaming PDF and creating chunks...")
            chunks_buffer = []
            total_chunks = 0
            pages_processed = 0
            
            for chunk_data in self.processor.process_pdf_streaming(temp_path):
                chunks_buffer.append(chunk_data)
                pages_processed = max(pages_processed, chunk_data['page_end'])
                
                # Process batch when buffer is full
                if len(chunks_buffer) >= batch_size:
                    await self._embed_and_store_batch(
                        chunks_buffer, congress, bill_type, bill_number
                    )
                    total_chunks += len(chunks_buffer)
                    print(f"  Embedded {total_chunks} chunks (pages 1-{pages_processed})")
                    
                    # Update job progress
                    if job_id:
                        await self._update_job_progress(
                            job_id, 
                            pages_processed=pages_processed,
                            chunks_embedded=total_chunks
                        )
                    
                    chunks_buffer = []
            
            # Process final batch
            if chunks_buffer:
                await self._embed_and_store_batch(
                    chunks_buffer, congress, bill_type, bill_number
                )
                total_chunks += len(chunks_buffer)
                print(f"  Embedded {total_chunks} chunks (final batch)")
                
                if job_id:
                    await self._update_job_progress(
                        job_id,
                        pages_processed=total_pages,
                        chunks_embedded=total_chunks
                    )
            
            print(f"✓ Successfully embedded {total_chunks} chunks from {total_pages} pages")
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass
    
    async def _embed_and_store_batch(
        self,
        chunks: List[Dict],
        congress: int,
        bill_type: str,
        bill_number: str
    ):
        """Embed a batch of chunks and store them in the database."""
        if not chunks:
            return
        
        # Extract texts for embedding
        texts = [chunk['text'] for chunk in chunks]
        
        # Batch embed all texts
        embeddings = self.embed_texts_batch(texts)
        
        # Prepare data for bulk insert
        insert_data = []
        for chunk, embedding in zip(chunks, embeddings):
            embedding_str = '[' + ','.join(map(str, embedding)) + ']'
            insert_data.append((
                congress,
                bill_type,
                bill_number,
                chunk['chunk_index'],
                chunk['text'],
                embedding_str,
                chunk['page_start'],
                chunk['page_end'],
                chunk['bucket_id']
            ))
        
        # Bulk insert into database
        async with self.db_pool.acquire() as conn:
            await conn.execute("SET search_path = public, extensions")
            
            await conn.executemany(
                """
                INSERT INTO bill_chunks 
                  (congress, bill_type, bill_number, chunk_index, text, embedding,
                   page_start, page_end, bucket_id)
                VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8, $9)
                ON CONFLICT (congress, bill_type, bill_number, chunk_index) DO UPDATE
                SET text = EXCLUDED.text, 
                    embedding = EXCLUDED.embedding,
                    page_start = EXCLUDED.page_start,
                    page_end = EXCLUDED.page_end,
                    bucket_id = EXCLUDED.bucket_id
                """,
                insert_data
            )
    
    async def _update_job_progress(
        self,
        job_id: int,
        total_pages: Optional[int] = None,
        pages_processed: Optional[int] = None,
        chunks_embedded: Optional[int] = None
    ):
        """Update job progress in database."""
        updates = []
        params = [job_id]
        param_idx = 2
        
        if total_pages is not None:
            updates.append(f"total_pages = ${param_idx}")
            params.append(total_pages)
            param_idx += 1
        
        if pages_processed is not None:
            updates.append(f"pages_processed = ${param_idx}")
            params.append(pages_processed)
            param_idx += 1
        
        if chunks_embedded is not None:
            updates.append(f"chunks_embedded = ${param_idx}")
            params.append(chunks_embedded)
            param_idx += 1
        
        if updates:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    f"UPDATE bill_embedding_jobs SET {', '.join(updates)}, status = 'processing' WHERE job_id = $1",
                    *params
                )
    
    async def query_bill(self, congress: int, bill_type: str, bill_number: str, question: str, top_k: int = 8) -> str:
        """
        Query a bill using RAG with page citations.
        
        Args:
            congress, bill_type, bill_number: Bill identifier
            question: User's question
            top_k: Number of chunks to retrieve
            
        Returns:
            AI-generated answer with page citations
        """
        print(f"\n=== Querying {bill_type.upper()} {bill_number}: {question} ===")
        
        # Embed the question
        print("Embedding question...")
        question_embedding = self.embed_text(question)
        
        # Convert embedding to pgvector format
        embedding_str = '[' + ','.join(map(str, question_embedding)) + ']'
        
        # Retrieve most relevant chunks WITH page metadata
        print(f"Retrieving top {top_k} chunks...")
        async with self.db_pool.acquire() as conn:
            await conn.execute("SET search_path = public, extensions")
            
            rows = await conn.fetch(
                """
                SELECT text, page_start, page_end, embedding <=> $1::vector AS distance
                FROM bill_chunks
                WHERE congress = $2 AND bill_type = $3 AND bill_number = $4
                ORDER BY embedding <=> $1::vector
                LIMIT $5
                """,
                embedding_str, congress, bill_type, bill_number, top_k
            )
        
        if not rows:
            return "This bill has not been embedded yet. Please embed it first."
        
        # Format context with page citations
        context_parts = []
        for row in rows:
            page_range = f"pp. {row['page_start']}-{row['page_end']}" if row['page_start'] and row['page_end'] else "page unknown"
            context_parts.append(f"[{page_range}]\n{row['text']}")
        
        context = "\n\n---\n\n".join(context_parts)
        print(f"Retrieved {len(rows)} chunks (avg distance: {sum(r['distance'] for r in rows)/len(rows):.3f})")
        
        # Generate answer using Gemini with citation requirements
        prompt = f"""You are an assistant answering questions about legislative text.

CRITICAL RULES:
1. Use ONLY the context provided below
2. CITE page ranges for every major claim using [pp. X-Y] format
3. If the context doesn't contain enough information, explicitly say:
   "The retrieved text does not contain enough information to answer this."
4. Do NOT use outside knowledge
5. Do NOT guess or infer beyond what the text states
6. When citing, use the page ranges shown in the context

[CONTEXT]
{context}

[QUESTION]
{question}

[ANSWER WITH CITATIONS]"""
        
        print("Generating answer with Gemini...")
        response = self.client.models.generate_content(
            model="models/gemini-2.5-flash",
            contents=prompt
        )
        
        answer = response.text
        print(f"✓ Generated answer ({len(answer)} chars)")
        
        return answer


async def main():
    """Example usage"""
    import sys
    from dotenv import load_dotenv
    
    load_dotenv()
    
    # Database connection
    db_pool = await asyncpg.create_pool(
        host=os.getenv("DB_HOST", "localhost"),
        port=int(os.getenv("DB_PORT", 5432)),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
        database=os.getenv("DB_NAME", "congress"),
        server_settings={'search_path': 'public,extensions'}
    )
    
    embedder = BillRAGEmbedder(
        api_key=os.getenv("GEMINI_API_KEY"),
        db_pool=db_pool
    )
    
    if len(sys.argv) > 1 and sys.argv[1] == "embed":
        # Embed a bill
        # Example: python bill_rag_embedder.py embed 119 hres 719 https://...
        congress = int(sys.argv[2])
        bill_type = sys.argv[3]
        bill_number = sys.argv[4]
        pdf_url = sys.argv[5]
        
        await embedder.embed_bill(congress, bill_type, bill_number, pdf_url)
        
    elif len(sys.argv) > 1 and sys.argv[1] == "query":
        # Query a bill
        # Example: python bill_rag_embedder.py query 119 hres 719 "What does this bill do?"
        congress = int(sys.argv[2])
        bill_type = sys.argv[3]
        bill_number = sys.argv[4]
        question = sys.argv[5]
        
        answer = await embedder.query_bill(congress, bill_type, bill_number, question)
        print(f"\n=== ANSWER ===\n{answer}\n")
    
    else:
        print("Usage:")
        print("  Embed: python bill_rag_embedder.py embed <congress> <bill_type> <bill_number> <pdf_url>")
        print("  Query: python bill_rag_embedder.py query <congress> <bill_type> <bill_number> <question>")
    
    await db_pool.close()


if __name__ == "__main__":
    asyncio.run(main())
