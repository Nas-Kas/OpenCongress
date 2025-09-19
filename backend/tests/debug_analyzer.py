#!/usr/bin/env python3
"""
Debug the improved analyzer to see what's happening
"""

import os
from dotenv import load_dotenv
from improved_bill_analyzer import ImprovedBillAnalyzer

def debug_analyzer():
    """Debug the analyzer step by step"""
    
    load_dotenv()
    congress_api_key = os.getenv("CONGRESS_API_KEY")
    
    analyzer = ImprovedBillAnalyzer(congress_api_key, None)
    
    # Get bill content
    content = analyzer.fetch_bill_content(119, 'hr', '747')
    
    if content:
        print(f"Got {len(content['sections'])} sections")
        
        for i, section in enumerate(content['sections'][:2]):  # Debug first 2 sections
            print(f"\n=== SECTION {i+1} ===")
            print(f"Num: {section.get('num')}")
            print(f"Text length: {len(section['text'])}")
            print(f"First 200 chars: {section['text'][:200]}...")
            
            # Extract signals
            signals = analyzer.extract_signals(section["text"])
            print(f"\nSignals extracted:")
            for key, value in signals.items():
                if isinstance(value, list):
                    print(f"  {key}: {len(value)} items - {value[:2]}")
                else:
                    print(f"  {key}: {value}")
            
            # Build map
            section_map = analyzer.build_map_from_signals(section, signals)
            print(f"\nSection map:")
            for key, value in section_map.items():
                if isinstance(value, list):
                    print(f"  {key}: {len(value)} items - {value[:2]}")
                elif isinstance(value, dict):
                    print(f"  {key}: {value}")
                else:
                    print(f"  {key}: {value}")
    else:
        print("Failed to get content")

if __name__ == "__main__":
    debug_analyzer()