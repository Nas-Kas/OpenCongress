"""
Hierarchical Summarizer for Large Bills
Uses map-reduce approach to summarize 3,000+ page bills
"""
import asyncpg
from google import genai
from typing import List, Dict, Optional
import json


class HierarchicalSummarizer:
    """Generate comprehensive summaries for large bills using map-reduce."""
    
    def __init__(self, api_key: str, db_pool: asyncpg.Pool):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
        self.db_pool = db_pool
    
    async def generate_bucket_summaries(
        self,
        congress: int,
        bill_type: str,
        bill_number: str,
        job_id: Optional[int] = None
    ):
        """
        Map step: Summarize each bucket of chunks.
        
        Args:
            congress, bill_type, bill_number: Bill identifier
            job_id: Optional job ID for progress tracking
        """
        print(f"\n=== Generating Bucket Summaries for {bill_type.upper()} {bill_number} ===")
        
        # Get all chunks grouped by bucket
        async with self.db_pool.acquire() as conn:
            buckets_data = await conn.fetch(
                """
                SELECT bucket_id, 
                       MIN(page_start) as page_start,
                       MAX(page_end) as page_end,
                       array_agg(text ORDER BY chunk_index) as texts
                FROM bill_chunks
                WHERE congress = $1 AND bill_type = $2 AND bill_number = $3
                  AND bucket_id IS NOT NULL
                GROUP BY bucket_id
                ORDER BY bucket_id
                """,
                congress, bill_type, bill_number
            )
        
        if not buckets_data:
            print("No chunks found with bucket_id. Skipping bucket summarization.")
            return
        
        print(f"Found {len(buckets_data)} buckets to summarize")
        
        # Process each bucket
        for i, bucket in enumerate(buckets_data):
            bucket_id = bucket['bucket_id']
            page_start = bucket['page_start']
            page_end = bucket['page_end']
            texts = bucket['texts']
            
            print(f"  Processing bucket {bucket_id} (pages {page_start}-{page_end})...")
            
            # Combine chunk texts
            context = "\n\n".join(texts)
            
            # Truncate if too long (Gemini has limits)
            max_context_chars = 100000  # ~25k tokens
            if len(context) > max_context_chars:
                context = context[:max_context_chars] + "\n\n[... content truncated ...]"
            
            # Generate structured summary
            prompt = f"""Summarize this section of a legislative bill (pages {page_start}-{page_end}).

Provide a structured summary with:

1. **Key Provisions**: Bullet points of major provisions (cite page ranges)
2. **Financial Impact**: Any appropriations, authorizations, or penalties
3. **Timeline**: Deadlines, effective dates, implementation schedules
4. **Definitions**: Key terms defined in this section
5. **Affected Entities**: Who/what is impacted by these provisions

Format your response as structured text with clear sections.
Include page citations in [pp. X-Y] format for each major point.

Text:
{context}
"""
            
            try:
                response = self.client.models.generate_content(
                    model="models/gemini-2.5-flash",
                    contents=prompt
                )
                summary_text = response.text
                
                # Extract key provisions for array storage
                key_provisions = self._extract_provisions(summary_text)
                
                # Extract financial impact
                financial_impact = self._extract_financial_impact(summary_text)
                
                # Store bucket summary
                async with self.db_pool.acquire() as conn:
                    await conn.execute(
                        """
                        INSERT INTO bill_chunk_summaries
                          (congress, bill_type, bill_number, bucket_id, 
                           page_start, page_end, summary_text, key_provisions, financial_impact)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                        ON CONFLICT (congress, bill_type, bill_number, bucket_id) DO UPDATE
                        SET summary_text = EXCLUDED.summary_text,
                            key_provisions = EXCLUDED.key_provisions,
                            financial_impact = EXCLUDED.financial_impact,
                            page_start = EXCLUDED.page_start,
                            page_end = EXCLUDED.page_end
                        """,
                        congress, bill_type, bill_number, bucket_id,
                        page_start, page_end, summary_text, key_provisions, financial_impact
                    )
                
                print(f"    ✓ Bucket {bucket_id} summarized")
                
                # Update job progress
                if job_id:
                    await self._update_job_progress(job_id, map_summaries_done=i+1)
                
            except Exception as e:
                print(f"    ✗ Error summarizing bucket {bucket_id}: {e}")
                continue
        
        print(f"✓ Completed {len(buckets_data)} bucket summaries")
    
    async def generate_final_summary(
        self,
        congress: int,
        bill_type: str,
        bill_number: str,
        job_id: Optional[int] = None
    ) -> Dict:
        """
        Reduce step: Combine bucket summaries into final comprehensive summary.
        
        Returns:
            Dictionary with structured summary data
        """
        print(f"\n=== Generating Final Summary for {bill_type.upper()} {bill_number} ===")
        
        # Retrieve all bucket summaries
        async with self.db_pool.acquire() as conn:
            bucket_summaries = await conn.fetch(
                """
                SELECT bucket_id, page_start, page_end, summary_text
                FROM bill_chunk_summaries
                WHERE congress = $1 AND bill_type = $2 AND bill_number = $3
                ORDER BY bucket_id
                """,
                congress, bill_type, bill_number
            )
        
        if not bucket_summaries:
            print("No bucket summaries found. Run generate_bucket_summaries first.")
            raise Exception("No bucket summaries found - cannot generate final summary")
        
        print(f"Combining {len(bucket_summaries)} bucket summaries...")
        
        # Combine into context
        context_parts = []
        for summary in bucket_summaries:
            context_parts.append(
                f"## Pages {summary['page_start']}-{summary['page_end']}\n{summary['summary_text']}"
            )
        context = "\n\n".join(context_parts)
        
        # Truncate if needed
        max_context_chars = 150000  # ~37k tokens
        if len(context) > max_context_chars:
            # Keep first and last parts, truncate middle
            first_part = context[:max_context_chars//2]
            last_part = context[-max_context_chars//2:]
            context = first_part + "\n\n[... middle sections truncated ...]\n\n" + last_part
        
        # Generate final comprehensive summary
        prompt = f"""Create a comprehensive summary of this legislative bill based on the section summaries below.

Structure your response EXACTLY as follows:

## EXECUTIVE SUMMARY
[2-3 paragraph overview of the bill's purpose and major impacts]

## KEY PROVISIONS
[Bullet points of major provisions with page citations in [pp. X-Y] format]

## FINANCIAL IMPACT
[Summary of appropriations, authorizations, penalties, and fiscal effects]

## TIMELINE & IMPLEMENTATION
[Key dates, deadlines, and implementation schedules]

## SIGNIFICANCE
[Why this bill matters - who it affects and how]

## DEFINITIONS
[Key terms and concepts defined in the bill]

Source summaries:
{context}
"""
        
        try:
            response = self.client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=prompt
            )
            final_summary_text = response.text
            
            # Parse into structured format
            summary_data = {
                "tldr": final_summary_text,
                "keyPoints": self._extract_key_points(final_summary_text),
                "financialInfo": self._extract_financial_section(final_summary_text),
                "importance": self._estimate_importance(final_summary_text),
                "readingTime": self._estimate_reading_time(final_summary_text),
                "cached": False
            }
            
            # Store in bill_summaries table
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    """
                    INSERT INTO bill_summaries (congress, bill_type, bill_number, summary)
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (congress, bill_type, bill_number) DO UPDATE
                    SET summary = EXCLUDED.summary, updated_at = now()
                    """,
                    congress, bill_type, bill_number, json.dumps(summary_data)
                )
            
            print("✓ Final summary generated and stored")
            
            # Update job progress
            if job_id:
                await self._update_job_progress(job_id, reduce_done=True)
            
            return summary_data
            
        except Exception as e:
            print(f"✗ Error generating final summary: {e}")
            raise
    
    def _extract_provisions(self, text: str) -> List[str]:
        """Extract key provisions from summary text."""
        provisions = []
        lines = text.split('\n')
        in_provisions = False
        
        for line in lines:
            if 'key provisions' in line.lower():
                in_provisions = True
                continue
            if in_provisions:
                if line.strip().startswith(('-', '•', '*')):
                    provisions.append(line.strip()[1:].strip())
                elif line.strip() and not line.strip().startswith('#'):
                    if len(provisions) < 10:  # Limit to 10
                        provisions.append(line.strip())
                if line.strip().startswith('##'):
                    break
        
        return provisions[:10]
    
    def _extract_financial_impact(self, text: str) -> Optional[str]:
        """Extract financial impact section."""
        lines = text.split('\n')
        in_financial = False
        financial_lines = []
        
        for line in lines:
            if 'financial impact' in line.lower():
                in_financial = True
                continue
            if in_financial:
                if line.strip().startswith('##'):
                    break
                if line.strip():
                    financial_lines.append(line.strip())
        
        return ' '.join(financial_lines) if financial_lines else None
    
    def _extract_key_points(self, text: str) -> List[str]:
        """Extract key points from final summary."""
        points = []
        lines = text.split('\n')
        
        for line in lines:
            if line.strip().startswith(('-', '•', '*')):
                point = line.strip()[1:].strip()
                if point and len(points) < 8:
                    points.append(point)
        
        return points
    
    def _extract_financial_section(self, text: str) -> str:
        """Extract financial impact section from final summary."""
        lines = text.split('\n')
        in_financial = False
        financial_lines = []
        
        for line in lines:
            if '## FINANCIAL IMPACT' in line:
                in_financial = True
                continue
            if in_financial:
                if line.strip().startswith('##'):
                    break
                if line.strip():
                    financial_lines.append(line.strip())
        
        return ' '.join(financial_lines) if financial_lines else "No specific financial provisions identified"
    
    def _estimate_importance(self, text: str) -> int:
        """Estimate bill importance (1-5 stars) based on content."""
        # Simple heuristic based on keywords
        importance_keywords = [
            'appropriates', 'billion', 'million', 'national security',
            'emergency', 'crisis', 'reform', 'establishes', 'creates'
        ]
        
        text_lower = text.lower()
        matches = sum(1 for keyword in importance_keywords if keyword in text_lower)
        
        # Map to 1-5 scale
        if matches >= 6:
            return 5
        elif matches >= 4:
            return 4
        elif matches >= 2:
            return 3
        elif matches >= 1:
            return 2
        else:
            return 1
    
    def _estimate_reading_time(self, text: str) -> str:
        """Estimate reading time based on text length."""
        words = len(text.split())
        minutes = max(1, words // 200)  # ~200 words per minute
        
        if minutes == 1:
            return "1 minute"
        elif minutes < 60:
            return f"{minutes} minutes"
        else:
            hours = minutes // 60
            remaining_mins = minutes % 60
            if remaining_mins == 0:
                return f"{hours} hour{'s' if hours > 1 else ''}"
            else:
                return f"{hours} hour{'s' if hours > 1 else ''} {remaining_mins} minutes"
    
    async def _update_job_progress(
        self,
        job_id: int,
        map_summaries_done: Optional[int] = None,
        reduce_done: Optional[bool] = None
    ):
        """Update job progress in database."""
        updates = []
        params = [job_id]
        param_idx = 2
        
        if map_summaries_done is not None:
            updates.append(f"map_summaries_done = ${param_idx}")
            params.append(map_summaries_done)
            param_idx += 1
        
        if reduce_done is not None:
            updates.append(f"reduce_done = ${param_idx}")
            params.append(reduce_done)
            param_idx += 1
        
        if updates:
            async with self.db_pool.acquire() as conn:
                await conn.execute(
                    f"UPDATE bill_embedding_jobs SET {', '.join(updates)} WHERE job_id = $1",
                    *params
                )
