#!/usr/bin/env python3
"""
Test the simplified summary for the large bill HR 4275
"""

import os
from dotenv import load_dotenv
from bill_text_scraper import BillTextScraper

def test_large_bill_summary():
    """Test simplified summary for HR 4275"""
    
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    
    scraper = BillTextScraper(api_key)
    
    print("Testing simplified summary for HR 4275...")
    
    try:
        # Get bill text
        result = scraper.get_bill_text(119, 'hr', '4275')
        
        if result:
            print(f"✅ Got bill text: {result['length']:,} characters")
            
            # Generate simplified summary
            summary_data = scraper.generate_summary(result['text'], result['title'])
            
            print("\n" + "="*60)
            print("SIMPLIFIED SUMMARY:")
            print("="*60)
            print(summary_data['summary'])
            print("\n" + "="*60)
            
            print(f"\nSTATISTICS:")
            print(f"- Word count: {summary_data['word_count']:,}")
            print(f"- Reading time: {summary_data['estimated_reading_time']} minutes")
            print(f"- Summary length: {len(summary_data['summary'])} characters")
            
        else:
            print("❌ Failed to get bill text")
            
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_large_bill_summary()