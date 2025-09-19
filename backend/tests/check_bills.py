#!/usr/bin/env python3
"""
Check what bills are actually in the database.
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def check_bills():
    """Show what bills are in the database"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # Check total bill count
        total_bills = await conn.fetchval("SELECT COUNT(*) FROM bills")
        print(f"📊 Total bills in database: {total_bills}")
        
        if total_bills == 0:
            print("❌ No bills found in database!")
            print("💡 You need to run your bill ingestion script first to populate bills.")
            return
        
        # Show bills by congress
        congress_counts = await conn.fetch(
            "SELECT congress, COUNT(*) as count FROM bills GROUP BY congress ORDER BY congress DESC"
        )
        
        print("\n📋 Bills by Congress:")
        for row in congress_counts:
            print(f"   Congress {row['congress']}: {row['count']} bills")
        
        # Show recent bills from Congress 119
        recent_bills = await conn.fetch(
            """
            SELECT congress, bill_type, bill_number, title, introduced_date
            FROM bills 
            WHERE congress = 119 
            ORDER BY bill_number::int 
            LIMIT 10
            """
        )
        
        if recent_bills:
            print(f"\n🏛️ Recent bills from Congress 119:")
            for bill in recent_bills:
                print(f"   {bill['bill_type'].upper()} {bill['bill_number']}: {bill['title'][:60]}...")
                print(f"      Introduced: {bill['introduced_date']}")
        else:
            print("\n❌ No bills found for Congress 119")
            
            # Check what congress numbers we do have
            all_congress = await conn.fetch(
                "SELECT DISTINCT congress FROM bills ORDER BY congress DESC LIMIT 5"
            )
            if all_congress:
                print("Available Congress numbers:")
                for c in all_congress:
                    print(f"   Congress {c['congress']}")
        
        # Show which bills have betting markets
        markets = await conn.fetch(
            """
            SELECT bm.congress, bm.bill_type, bm.bill_number, b.title
            FROM betting_markets bm
            JOIN bills b ON b.congress = bm.congress 
                AND b.bill_type = bm.bill_type 
                AND b.bill_number = bm.bill_number
            ORDER BY bm.market_id
            """
        )
        
        if markets:
            print(f"\n🎯 Bills with betting markets ({len(markets)}):")
            for market in markets:
                print(f"   {market['bill_type'].upper()} {market['bill_number']}: {market['title'][:60]}...")
        else:
            print("\n❌ No betting markets found")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(check_bills())