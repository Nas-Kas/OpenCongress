#!/usr/bin/env python3
"""
Test script for the bill ingestion system
"""

import asyncio
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv()

async def test_bill_ingest():
    """Test the bill ingestion and check results."""
    
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        print("❌ DATABASE_URL not found")
        return
    
    # Check what bills we have before ingestion
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    
    async with pool.acquire() as conn:
        # Count existing bills
        before_count = await conn.fetchval("SELECT COUNT(*) FROM bills")
        print(f"📊 Bills in database before ingestion: {before_count}")
        
        # Show some recent bills if any exist
        recent_bills = await conn.fetch("""
            SELECT congress, bill_type, bill_number, title, introduced_date, updated_at
            FROM bills 
            ORDER BY updated_at DESC 
            LIMIT 5
        """)
        
        if recent_bills:
            print("\n📋 Most recent bills in database:")
            for bill in recent_bills:
                print(f"  • {bill['bill_type'].upper()} {bill['bill_number']}: {bill['title'][:60]}...")
        else:
            print("\n📋 No bills found in database")
    
    await pool.close()
    
    print("\n" + "="*60)
    print("🚀 Running bill ingestion test...")
    print("="*60)
    
    # Run the ingestion (small test - just 10 bills)
    from ingest_bills import ingest_recent_bills
    
    try:
        await ingest_recent_bills(
            congress=119,
            limit=10,  # Small test
            fetch_details=True,
            workers=2
        )
        print("✅ Bill ingestion completed successfully!")
    except Exception as e:
        print(f"❌ Bill ingestion failed: {e}")
        return
    
    # Check results after ingestion
    pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=5)
    
    async with pool.acquire() as conn:
        # Count bills after ingestion
        after_count = await conn.fetchval("SELECT COUNT(*) FROM bills")
        new_bills = after_count - before_count
        
        print(f"\n📊 Bills in database after ingestion: {after_count}")
        print(f"📈 New bills added: {new_bills}")
        
        # Show newly added bills
        if new_bills > 0:
            recent_bills = await conn.fetch("""
                SELECT congress, bill_type, bill_number, title, introduced_date, 
                       latest_action->>'text' as latest_action_text
                FROM bills 
                ORDER BY updated_at DESC 
                LIMIT 10
            """)
            
            print("\n📋 Recently ingested bills:")
            for bill in recent_bills:
                action_text = bill['latest_action_text'] or "No recent action"
                if len(action_text) > 50:
                    action_text = action_text[:50] + "..."
                    
                print(f"  • {bill['bill_type'].upper()} {bill['bill_number']}: {bill['title'][:50]}...")
                print(f"    Latest: {action_text}")
                print()
        
        # Check for bills without votes (the main goal)
        bills_without_votes = await conn.fetch("""
            SELECT b.congress, b.bill_type, b.bill_number, b.title
            FROM bills b
            LEFT JOIN house_votes hv ON (
                hv.congress = b.congress 
                AND LOWER(hv.legislation_type) = b.bill_type 
                AND hv.legislation_number = b.bill_number
            )
            WHERE hv.congress IS NULL
            ORDER BY b.updated_at DESC
            LIMIT 5
        """)
        
        print(f"\n🎯 Bills without House votes: {len(bills_without_votes)} found")
        if bills_without_votes:
            print("   These are perfect for early-stage betting markets!")
            for bill in bills_without_votes:
                print(f"  • {bill['bill_type'].upper()} {bill['bill_number']}: {bill['title'][:60]}...")
    
    await pool.close()
    print("\n✅ Test completed!")

if __name__ == "__main__":
    asyncio.run(test_bill_ingest())