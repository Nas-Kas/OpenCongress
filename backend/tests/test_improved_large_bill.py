#!/usr/bin/env python3
"""
Test the improved summary with the large bill HR 4275
"""

import os
from dotenv import load_dotenv
from bill_text_scraper import BillTextScraper

def test_improved_large_bill():
    """Test the improved summary for HR 4275"""
    
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    
    scraper = BillTextScraper(api_key)
    
    print("Testing improved summary for HR 4275 (large bill)...")
    
    try:
        # Get bill text
        result = scraper.get_bill_text(119, 'hr', '4275')
        
        if result:
            print(f"✅ Got bill text: {result['length']:,} characters")
            
            # Generate improved summary
            summary_data = scraper.generate_summary(result['text'], result['title'])
            
            print("\n" + "="*60)
            print("IMPROVED SUMMARY (HR 4275):")
            print("="*60)
            print(summary_data['summary'])
            print("\n" + "="*60)
            
            print(f"\nSTATISTICS:")
            print(f"- Word count: {summary_data['word_count']:,}")
            print(f"- Reading time: {summary_data['estimated_reading_time']} minutes")
            print(f"- Summary length: {len(summary_data['summary'])} characters")
            print(f"- Key topics: {[p['term'] for p in summary_data['key_phrases']]}")
            
            if summary_data.get('structured_data'):
                structured = summary_data['structured_data']
                print(f"\nSTRUCTURED DATA:")
                print(f"- What it does: {len(structured.get('what_it_does', []))} items")
                print(f"- Who's affected: {len(structured.get('who_is_affected', []))} items")
                print(f"- Money provisions: {len(structured.get('money', {}).get('authorizations', []))} auth, {len(structured.get('money', {}).get('appropriations', []))} approp")
                print(f"- Agencies: {len(structured.get('agencies', []))} agencies")
                print(f"- Reporting: {len(structured.get('reporting', []))} requirements")
                print(f"- Enforcement: {len(structured.get('enforcement', []))} penalties")
                
                if structured.get('what_it_does'):
                    print(f"\nTOP 5 THINGS IT DOES:")
                    for i, item in enumerate(structured['what_it_does'][:5], 1):
                        print(f"{i}. {item}")
                
                if structured.get('who_is_affected'):
                    print(f"\nWHO'S AFFECTED:")
                    for i, item in enumerate(structured['who_is_affected'][:5], 1):
                        print(f"{i}. {item}")
                
                if structured.get('agencies'):
                    print(f"\nAGENCIES INVOLVED:")
                    for i, agency in enumerate(structured['agencies'][:5], 1):
                        print(f"{i}. {agency}")
        else:
            print("❌ Failed to get bill text")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_improved_large_bill()