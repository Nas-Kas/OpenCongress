#!/usr/bin/env python3
"""
Create sample betting markets for testing.
"""

import asyncio
import asyncpg
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def create_sample_markets():
    """Create some sample betting markets"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # First, let's see what bills we have in the database
        bills = await conn.fetch(
            """
            SELECT congress, bill_type, bill_number, title 
            FROM bills 
            WHERE congress = 119 
            ORDER BY bill_number::int 
            LIMIT 10
            """
        )
        
        if not bills:
            print("❌ No bills found in database. You need some bill data first.")
            print("💡 Try running your bill ingestion script to populate some bills.")
            return
        
        print(f"📋 Found {len(bills)} bills to create markets for...")
        
        # Create markets for the first few bills
        markets_created = 0
        for bill in bills[:5]:  # Create markets for first 5 bills
            # Check if market already exists
            existing = await conn.fetchval(
                "SELECT market_id FROM betting_markets WHERE congress = $1 AND bill_type = $2 AND bill_number = $3",
                bill['congress'], bill['bill_type'], bill['bill_number']
            )
            
            if existing:
                print(f"⏭️  Market already exists for {bill['bill_type'].upper()} {bill['bill_number']}")
                continue
            
            # Set deadline 30 days from now
            deadline = datetime.now() + timedelta(days=30)
            
            # Create the market
            market_id = await conn.fetchval(
                """
                INSERT INTO betting_markets (congress, bill_type, bill_number, title, description, deadline)
                VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING market_id
                """,
                bill['congress'], 
                bill['bill_type'], 
                bill['bill_number'],
                bill['title'],
                f"Will {bill['bill_type'].upper()} {bill['bill_number']} pass the House?",
                deadline
            )
            
            # Set initial 50/50 odds
            await conn.execute(
                """
                INSERT INTO market_odds (market_id, position, odds) VALUES
                ($1, 'pass', 2.0),
                ($1, 'fail', 2.0)
                """,
                market_id
            )
            
            print(f"✅ Created market {market_id} for {bill['bill_type'].upper()} {bill['bill_number']}: {bill['title'][:60]}...")
            markets_created += 1
        
        if markets_created == 0:
            print("ℹ️  All available bills already have markets")
        else:
            print(f"\n🎉 Created {markets_created} new betting markets!")
        
        # Show final stats
        market_count = await conn.fetchval("SELECT COUNT(*) FROM betting_markets")
        print(f"\n📊 Total markets in database: {market_count}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(create_sample_markets())