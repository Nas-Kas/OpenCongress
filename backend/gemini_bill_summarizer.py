import requests
from google import genai
import os
import tempfile
import re
from typing import Dict, Any, Optional
from io import BytesIO
import fitz as PyMuPDF

class GeminiBillSummarizer:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = genai.Client(api_key=api_key)
    
    def summarize_bill_from_url(self, pdf_url: str, congress: int, bill_type: str, bill_number: str) -> Dict[str, Any]:
        """
        Download PDF from URL and generate summary using Gemini
        """
        try:
            # Download PDF to temporary file
            print(f"Downloading PDF from: {pdf_url}")
            response = requests.get(pdf_url, timeout=60)
            response.raise_for_status()
            
            # Create temporary file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
                temp_file.write(response.content)
                temp_path = temp_file.name
            
            try:
                # Process PDF - extract first 500 pages if over 1000 pages
                processed_pdf_path, is_truncated = self._process_large_pdf(temp_path)
                
                # Generate summary using Gemini
                summary_result = self._generate_summary_from_pdf(processed_pdf_path, bill_type, bill_number, is_truncated)
                
                # Check if Gemini failed (returns None)
                if summary_result is None:
                    print("Gemini failed, returning None to trigger fallback")
                    return None
                
                return {
                    'success': True,
                    'title': f"{bill_type.upper()} {bill_number}",
                    'source_url': pdf_url,
                    'text_length': len(response.content),
                    'summary_data': summary_result,
                    'scraped_at': None  # Gemini doesn't need text scraping
                }
                
            finally:
                # Clean up temporary files
                try:
                    os.unlink(temp_path)
                    if processed_pdf_path != temp_path:
                        os.unlink(processed_pdf_path)
                except:
                    pass
                    
        except Exception as e:
            print(f"Error in Gemini summarization: {e}")
            return None
    
    def _process_large_pdf(self, pdf_path: str) -> tuple[str, bool]:
        """
        Check PDF page count and extract first 500 pages if it exceeds 1000 pages
        Returns (processed_pdf_path, is_truncated)
        """
        try:
            # Open PDF to check page count
            doc = PyMuPDF.open(pdf_path)
            page_count = len(doc)
            
            print(f"PDF has {page_count} pages")
            
            # Gemini has a hard limit of 1000 pages for PDF uploads
            if page_count <= 1000:
                doc.close()
                return pdf_path, False
            
            # Extract first 1000 pages for large documents (Gemini's limit)
            print(f"PDF has {page_count} pages, extracting first 1000 pages for analysis (Gemini limit)...")
            
            # Create new PDF with first 1000 pages (Gemini's limit)
            new_doc = PyMuPDF.open()
            for page_num in range(min(1000, page_count)):
                new_doc.insert_pdf(doc, from_page=page_num, to_page=page_num)
            
            # Save truncated PDF
            truncated_path = pdf_path.replace('.pdf', '_truncated.pdf')
            new_doc.save(truncated_path)
            
            # Clean up
            doc.close()
            new_doc.close()
            
            return truncated_path, True
            
        except Exception as e:
            print(f"Error processing PDF: {e}")
            # Return original path if processing fails
            return pdf_path, False
    
    def _generate_summary_from_pdf(self, pdf_path: str, bill_type: str, bill_number: str, is_truncated: bool = False) -> Dict[str, Any]:
        """
        Upload PDF to Gemini and generate structured summary
        """
        try:
            # Upload PDF to Gemini
            print("Uploading PDF to Gemini...")
            uploaded = self.client.files.upload(
                file=pdf_path,
                config={
                    "display_name": f"{bill_type.upper()}_{bill_number}.pdf",
                    "mime_type": "application/pdf"
                }
            )
            
            print(f"Uploaded to Gemini: {uploaded.uri}")
            
            # Generate summary with structured prompt
            prompt = self._create_summary_prompt(bill_type, bill_number, is_truncated)
            
            print("Generating summary with Gemini...")
            response = self.client.models.generate_content(
                model="models/gemini-2.5-flash",
                contents=[
                    {"file_data": {"file_uri": uploaded.uri}},
                    prompt
                ]
            )
            
            # Parse the response into structured data
            summary_text = response.text
            
            if not summary_text:
                print("Error: Gemini returned empty response")
                return None
            
            parsed_summary = self._parse_gemini_response(summary_text, is_truncated)
            
            return parsed_summary
            
        except Exception as e:
            print(f"Error generating Gemini summary: {e}")
            # Return None to indicate failure - let the main API fall back to text scraper
            return None
    
    def _create_summary_prompt(self, bill_type: str, bill_number: str, is_truncated: bool = False) -> str:
        """
        Create a structured prompt for Gemini to generate consistent summaries
        """
        truncation_note = ""
        if is_truncated:
            truncation_note = "\n\n**IMPORTANT NOTE:** This analysis is based on the first 500 pages of a larger document. Some provisions may not be covered in this summary."
        
        return f"""
Please analyze this legislative bill ({bill_type.upper()} {bill_number}) and provide a comprehensive summary in the following structured format:{truncation_note}

## EXECUTIVE SUMMARY
Provide a clear, detailed overview of what this bill does, including its main purpose and key objectives.

## KEY PROVISIONS
List the most important things this bill would do with bullet points:
- **[Provision Title]:** Description of what it does
- **[Provision Title]:** Description of what it does
- **[Provision Title]:** Description of what it does

## FINANCIAL IMPACT
Describe any funding, appropriations, penalties, or financial implications. If there are no financial provisions, state that clearly.

## TIMELINE & IMPLEMENTATION
Note any important deadlines, effective dates, or implementation requirements. If this is a resolution with no implementation timeline, explain that.

## SIGNIFICANCE
Explain why this bill matters, who it would affect, and its broader implications for policy or society.

## DEFINITIONS
List any key terms or concepts defined in the bill. If none are explicitly defined, note that.

Please write in clear, accessible language that a general audience can understand. Focus on practical impacts and real-world implications rather than legal jargon. Be comprehensive and detailed in your analysis.
"""
    
    def _parse_gemini_response(self, response_text: str, is_truncated: bool = False) -> Dict[str, Any]:
        """
        Return the full Gemini response with minimal processing
        """
        try:
            if not response_text:
                raise ValueError("Response text is empty")
            
            # Calculate basic metrics
            word_count = len(response_text.split())
            reading_time = max(1, word_count // 200)  # ~200 words per minute
            
            # Add truncation notice if applicable
            final_text = response_text
            if is_truncated and "**IMPORTANT NOTE:**" not in response_text:
                final_text = "**⚠️ PARTIAL ANALYSIS:** This summary is based on the first 500 pages of a larger document.\n\n" + response_text
            
            # Return the FULL Gemini response - no truncation
            return {
                'tldr': final_text,  # FULL Gemini summary with truncation notice if needed
                'keyPoints': [],  # Empty - we'll show everything in tldr
                'financialInfo': "",  # Empty - included in main summary
                'importance': 4,  # Default high importance
                'readingTime': f"{reading_time} minute{'s' if reading_time != 1 else ''}",
                'word_count': word_count,
                'estimated_reading_time': reading_time,
                'full_response': response_text,
                'is_partial_analysis': is_truncated
            }
            
        except Exception as e:
            print(f"Error processing Gemini response: {e}")
            return {
                'tldr': response_text if response_text else "Error generating summary",
                'keyPoints': [],
                'financialInfo': "Analysis not available",
                'importance': 3,
                'readingTime': "2-3 minutes",
                'word_count': len(response_text.split()) if response_text else 0,
                'estimated_reading_time': 2,
                'is_partial_analysis': is_truncated
            }