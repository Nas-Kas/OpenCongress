#!/usr/bin/env python3
"""
Test script for the bill summary generation endpoint
Run this after starting the FastAPI server with: uvicorn main:app --reload
"""

import requests
import json

def test_generate_summary():
    """Test the generate summary endpoint"""
    url = "http://127.0.0.1:8000/bill/119/hr/747/generate-summary"
    
    print(f"Testing endpoint: {url}")
    
    try:
        response = requests.get(url, timeout=60)  # Longer timeout for scraping
        
        print(f"Status Code: {response.status_code}")
        
        if response.ok:
            data = response.json()
            print("\n✅ SUCCESS!")
            print(f"Bill: {data['bill_info']['title']}")
            print(f"Summary: {data['summary'][:200]}...")
            print(f"Key phrases: {[p['term'] for p in data['analysis']['key_phrases'][:3]]}")
            print(f"Word count: {data['analysis']['word_count']}")
            print(f"Reading time: {data['analysis']['estimated_reading_time']} minutes")
        else:
            print(f"\n❌ ERROR: {response.status_code}")
            print(response.text)
            
    except requests.exceptions.ConnectionError:
        print("❌ Connection failed. Make sure the FastAPI server is running:")
        print("   uvicorn main:app --reload --host 127.0.0.1 --port 8000")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_generate_summary()