#!/usr/bin/env python3
"""
Update betting database schema for advanced markets.
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def update_schema():
    """Update the betting schema for advanced markets"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        print("🔄 Updating betting schema for advanced markets...")
        
        # Add new columns to betting_markets table
        await conn.execute("""
            ALTER TABLE betting_markets 
            ADD COLUMN IF NOT EXISTS target_member TEXT,
            ADD COLUMN IF NOT EXISTS target_count INT,
            ADD COLUMN IF NOT EXISTS target_date DATE,
            ADD COLUMN IF NOT EXISTS bill_exists BOOLEAN DEFAULT true
        """)
        
        # Update market_type column to use new default
        await conn.execute("""
            ALTER TABLE betting_markets 
            ALTER COLUMN market_type SET DEFAULT 'bill_passage'
        """)
        
        # Update existing markets to use new market_type
        await conn.execute("""
            UPDATE betting_markets 
            SET market_type = 'bill_passage' 
            WHERE market_type = 'pass_fail'
        """)
        
        # Create speculative_bills table
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS speculative_bills (
                spec_bill_id    SERIAL PRIMARY KEY,
                congress        INT NOT NULL,
                bill_type       TEXT NOT NULL,
                bill_number     TEXT NOT NULL,
                title           TEXT,
                description     TEXT,
                expected_intro_date DATE,
                created_by      INT,
                created_at      TIMESTAMPTZ DEFAULT now(),
                UNIQUE(congress, bill_type, bill_number),
                FOREIGN KEY (created_by) REFERENCES users (user_id)
            )
        """)
        
        print("✅ Schema updated successfully!")
        
        # Show current state
        market_count = await conn.fetchval("SELECT COUNT(*) FROM betting_markets")
        spec_bill_count = await conn.fetchval("SELECT COUNT(*) FROM speculative_bills")
        
        print(f"\n📊 Current state:")
        print(f"   Betting markets: {market_count}")
        print(f"   Speculative bills: {spec_bill_count}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(update_schema())