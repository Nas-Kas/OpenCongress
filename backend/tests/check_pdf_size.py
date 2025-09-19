#!/usr/bin/env python3
"""
Check the size of HR 4275 PDF to understand the issue
"""

import requests
import os
from dotenv import load_dotenv
from bill_text_scraper import BillTextScraper

def check_pdf_info():
    """Check PDF information for HR 4275"""
    
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    
    scraper = BillTextScraper(api_key)
    
    # Try to get bill text info for HR 4275
    print("Checking HR 4275 PDF information...")
    
    try:
        # First try the API to get the PDF URL
        if api_key:
            url = f"https://api.congress.gov/v3/bill/119/hr/4275/text"
            params = {'api_key': api_key, 'format': 'json'}
            
            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()
            
            data = response.json()
            text_versions = data.get('textVersions', [])
            
            if text_versions:
                latest_version = text_versions[0]
                formats = latest_version.get('formats', [])
                
                print(f"Available formats for HR 4275:")
                for format_info in formats:
                    format_url = format_info.get('url', '')
                    print(f"- {format_url}")
                    
                    # Check size for PDF files
                    if format_url.endswith('.pdf'):
                        try:
                            head_response = requests.head(format_url, timeout=30)
                            if head_response.status_code == 200:
                                content_length = head_response.headers.get('content-length')
                                if content_length:
                                    size_mb = int(content_length) / (1024 * 1024)
                                    print(f"  PDF size: {size_mb:.1f} MB")
                                    
                                    if size_mb > 50:
                                        print(f"  ⚠️  PDF is very large ({size_mb:.1f} MB > 50 MB limit)")
                                    else:
                                        print(f"  ✅ PDF size is manageable")
                                else:
                                    print(f"  No content-length header")
                            else:
                                print(f"  Could not check size (status: {head_response.status_code})")
                        except Exception as e:
                            print(f"  Error checking PDF size: {e}")
            else:
                print("No text versions found")
        else:
            print("No API key available")
            
    except Exception as e:
        print(f"Error checking PDF info: {e}")

def test_optimized_extraction():
    """Test the optimized PDF extraction with limits"""
    
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    
    scraper = BillTextScraper(api_key)
    
    print("\nTesting optimized extraction for HR 4275...")
    
    try:
        # Try to get bill text with our optimizations
        result = scraper.get_bill_text(119, 'hr', '4275')
        
        if result:
            print(f"✅ Successfully extracted text!")
            print(f"Title: {result['title']}")
            print(f"Text length: {result['length']:,} characters")
            print(f"Source: {result['source']}")
            print(f"First 200 chars: {result['text'][:200]}...")
        else:
            print("❌ Failed to extract text")
            
    except Exception as e:
        print(f"❌ Error during extraction: {e}")

if __name__ == "__main__":
    check_pdf_info()
    test_optimized_extraction()