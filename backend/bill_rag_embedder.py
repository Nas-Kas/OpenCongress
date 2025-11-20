"""
Bill RAG Embedder - Chunks and embeds bill text for semantic search
"""
import os
import asyncpg
import asyncio
from google import genai
import fitz as PyMuPDF  # fitz
import requests
from typing import List, Tuple
import re

class BillRAGEmbedder:
    def __init__(self, api_key: str, db_pool):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.db_pool = db_pool
        
    def extract_text_from_pdf(self, pdf_path: str) -> str:
        """Extract all text from PDF"""
        doc = PyMuPDF.open(pdf_path)
        text = ""
        for page in doc:
            text += page.get_text()
        doc.close()
        return text
    
    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> List[str]:
        """
        Split text into overlapping chunks
        
        Args:
            text: Full bill text
            chunk_size: Target size in characters (roughly 250 tokens)
            overlap: Overlap between chunks to preserve context
        """
        # Clean up text
        text = re.sub(r'\s+', ' ', text).strip()
        
        chunks = []
        start = 0
        
        while start < len(text):
            end = start + chunk_size
            
            # Try to break at sentence boundary
            if end < len(text):
                # Look for period followed by space and capital letter
                sentence_end = text.rfind('. ', start, end)
                if sentence_end > start + chunk_size // 2:  # Don't break too early
                    end = sentence_end + 1
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            # Move start forward with overlap
            start = end - overlap if end < len(text) else end
        
        return chunks
    
    def embed_text(self, text: str) -> List[float]:
        """Generate embedding for text using Gemini"""
        result = self.client.models.embed_content(
            model="models/text-embedding-004",
            contents=text
        )
        return result.embeddings[0].values
    
    async def embed_bill(self, congress: int, bill_type: str, bill_number: str, pdf_url: str):
        """
        Download bill PDF, chunk it, embed chunks, and store in database
        """
        print(f"\n=== Embedding {bill_type.upper()} {bill_number} ===")
        
        # Check if already embedded
        async with self.db_pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT COUNT(*) FROM bill_chunks WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                congress, bill_type, bill_number
            )
            if existing > 0:
                print(f"Already embedded ({existing} chunks). Skipping.")
                return
        
        # Download PDF
        print(f"Downloading PDF from {pdf_url}")
        response = requests.get(pdf_url, timeout=60)
        response.raise_for_status()
        
        # Save to temp file
        import tempfile
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            temp_file.write(response.content)
            temp_path = temp_file.name
        
        try:
            # Extract text
            print("Extracting text from PDF...")
            text = self.extract_text_from_pdf(temp_path)
            print(f"Extracted {len(text)} characters")
            
            # Chunk text
            print("Chunking text...")
            chunks = self.chunk_text(text)
            print(f"Created {len(chunks)} chunks")
            
            # Embed and store chunks
            print("Embedding chunks...")
            async with self.db_pool.acquire() as conn:
                for i, chunk in enumerate(chunks):
                    if i % 10 == 0:
                        print(f"  Processing chunk {i+1}/{len(chunks)}")
                    
                    # Generate embedding
                    embedding = self.embed_text(chunk)
                    
                    # Convert embedding list to pgvector format string
                    embedding_str = '[' + ','.join(map(str, embedding)) + ']'
                    
                    # Store in database
                    await conn.execute(
                        """
                        INSERT INTO bill_chunks (congress, bill_type, bill_number, chunk_index, text, embedding)
                        VALUES ($1, $2, $3, $4, $5, $6::vector)
                        ON CONFLICT (congress, bill_type, bill_number, chunk_index) DO UPDATE
                        SET text = EXCLUDED.text, embedding = EXCLUDED.embedding
                        """,
                        congress, bill_type, bill_number, i, chunk, embedding_str
                    )
            
            print(f"✓ Successfully embedded {len(chunks)} chunks")
            
        finally:
            # Clean up temp file
            try:
                os.unlink(temp_path)
            except:
                pass
    
    async def query_bill(self, congress: int, bill_type: str, bill_number: str, question: str, top_k: int = 6) -> str:
        """
        Query a bill using RAG
        
        Args:
            congress, bill_type, bill_number: Bill identifier
            question: User's question
            top_k: Number of chunks to retrieve
            
        Returns:
            AI-generated answer based on retrieved chunks
        """
        print(f"\n=== Querying {bill_type.upper()} {bill_number}: {question} ===")
        
        # Embed the question
        print("Embedding question...")
        question_embedding = self.embed_text(question)
        
        # Convert embedding to pgvector format
        embedding_str = '[' + ','.join(map(str, question_embedding)) + ']'
        
        # Retrieve most relevant chunks
        print(f"Retrieving top {top_k} chunks...")
        async with self.db_pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT text, embedding <=> $1::vector AS distance
                FROM bill_chunks
                WHERE congress = $2 AND bill_type = $3 AND bill_number = $4
                ORDER BY embedding <=> $1::vector
                LIMIT $5
                """,
                embedding_str, congress, bill_type, bill_number, top_k
            )
        
        if not rows:
            return "This bill has not been embedded yet. Please embed it first."
        
        # Combine retrieved chunks
        context = "\n\n---\n\n".join([row['text'] for row in rows])
        print(f"Retrieved {len(rows)} chunks (avg distance: {sum(r['distance'] for r in rows)/len(rows):.3f})")
        
        # Generate answer using Gemini
        prompt = f"""You are an assistant answering questions about legislative text.

Use only the context provided below to answer the question. If the context does not contain enough information to answer, say "The bill text does not contain enough information to answer this."

If calculations or aggregation (like totals) are needed, perform them based only on the context.

Do not use outside knowledge. Do not guess. Do not add interpretation beyond what the text states.

[CONTEXT]
{context}

[QUESTION]
{question}

[ANSWER]"""
        
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
        database=os.getenv("DB_NAME", "congress")
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
