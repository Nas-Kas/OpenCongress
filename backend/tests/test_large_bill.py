#!/usr/bin/env python3
"""
Test script for large bill processing (HR 4275)
"""

import requests
import time

def test_large_bill():
    """Test the large bill HR 4275 with our optimizations"""
    
    url = "http://127.0.0.1:8000/bill/119/hr/4275/generate-summary"
    
    print(f"Testing large bill endpoint: {url}")
    print("This may take several minutes due to the large PDF size...")
    
    start_time = time.time()
    
    try:
        response = requests.get(url, timeout=600)  # 10 minute timeout
        elapsed = time.time() - start_time
        
        print(f"Request completed in {elapsed:.1f} seconds")
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print("\n✅ SUCCESS!")
            print(f"Bill: {data['bill_info']['title']}")
            print(f"Text length: {data['bill_info']['text_length']:,} characters")
            print(f"Summary length: {len(data['summary'])} characters")
            print(f"Word count: {data['analysis']['word_count']:,}")
            print(f"Reading time: {data['analysis']['estimated_reading_time']} minutes")
            print(f"Key phrases found: {len(data['analysis']['key_phrases'])}")
            print(f"Sections found: {len(data['analysis']['sections'])}")
            
            # Show first part of summary
            summary_preview = data['summary'][:300] + "..." if len(data['summary']) > 300 else data['summary']
            print(f"\nSummary preview: {summary_preview}")
            
        elif response.status_code == 408:
            print("\n⏰ TIMEOUT - Bill processing timed out (bill too large)")
            print("This is expected for very large bills")
        elif response.status_code == 404:
            print("\n❌ NOT FOUND - Could not fetch bill text")
        else:
            print(f"\n❌ ERROR - Status {response.status_code}")
            print(f"Response: {response.text}")
            
    except requests.exceptions.Timeout:
        elapsed = time.time() - start_time
        print(f"\n⏰ REQUEST TIMEOUT after {elapsed:.1f} seconds")
        print("The bill is likely too large to process within timeout limits")
    except requests.exceptions.ConnectionError:
        print("\n❌ CONNECTION ERROR - Make sure the server is running")
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"\n❌ UNEXPECTED ERROR after {elapsed:.1f} seconds: {e}")

if __name__ == "__main__":
    test_large_bill()