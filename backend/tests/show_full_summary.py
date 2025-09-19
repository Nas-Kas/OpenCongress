#!/usr/bin/env python3
"""
Script to show the full comprehensive summary output
"""

import os
from dotenv import load_dotenv
from bill_text_scraper import BillTextScraper

def show_full_summary():
    """Show the complete comprehensive summary for HR 747"""
    load_dotenv()
    api_key = os.getenv("CONGRESS_API_KEY")
    
    scraper = BillTextScraper(api_key)
    
    # Get bill text for HR 747
    result = scraper.get_bill_text(119, 'hr', '747')
    
    if result:
        print(f"Bill Title: {result['title']}")
        print(f"Text Length: {result['length']} characters")
        print("=" * 80)
        
        # Generate comprehensive summary
        summary_data = scraper.generate_summary(result['text'], result['title'])
        
        print("COMPREHENSIVE SUMMARY:")
        print("=" * 80)
        print(summary_data['summary'])
        print("\n" + "=" * 80)
        
        print(f"\nKEY STATISTICS:")
        print(f"- Word count: {summary_data['word_count']:,}")
        print(f"- Estimated reading time: {summary_data['estimated_reading_time']} minutes")
        print(f"- Number of sections: {len(summary_data['sections'])}")
        print(f"- Key phrases identified: {len(summary_data['key_phrases'])}")
        print(f"- Provisions found: {len(summary_data['provisions'])}")
        print(f"- Definitions extracted: {len(summary_data['definitions'])}")
        
        print(f"\nTOP KEY PHRASES:")
        for i, phrase in enumerate(summary_data['key_phrases'][:10], 1):
            print(f"{i:2d}. {phrase['term']} (mentioned {phrase['frequency']} times)")
        
        if summary_data['provisions']:
            print(f"\nPROVISIONS IDENTIFIED:")
            for i, provision in enumerate(summary_data['provisions'], 1):
                print(f"{i}. [{provision['type'].upper()}] {provision['description'][:100]}...")
        
        if summary_data['definitions']:
            print(f"\nKEY DEFINITIONS:")
            for i, definition in enumerate(summary_data['definitions'], 1):
                print(f"{i}. {definition['term']}: {definition['definition'][:100]}...")
    
    else:
        print("Failed to retrieve bill text")

if __name__ == "__main__":
    show_full_summary()