#!/usr/bin/env python3
"""
Initialize betting tables in the database.
Run this after setting up your main database schema.
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def init_betting_tables():
    """Create betting system tables"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # Read and execute the schema
        import os
        script_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(script_dir, "db", "schema.sql")
        with open(schema_path, "r") as f:
            schema_sql = f.read()
        
        await conn.execute(schema_sql)
        print("✅ Betting tables created successfully!")
        
        # Create a sample user for testing
        user_id = await conn.fetchval(
            """
            INSERT INTO users (username, email, balance) 
            VALUES ('demo_user', 'demo@example.com', 1000.00)
            ON CONFLICT (username) DO NOTHING
            RETURNING user_id
            """
        )
        
        if user_id:
            print(f"✅ Demo user created with ID: {user_id}")
        else:
            print("ℹ️  Demo user already exists")
            
        # Show some stats
        user_count = await conn.fetchval("SELECT COUNT(*) FROM users")
        market_count = await conn.fetchval("SELECT COUNT(*) FROM betting_markets")
        bet_count = await conn.fetchval("SELECT COUNT(*) FROM bets")
        
        print(f"\n📊 Database Stats:")
        print(f"   Users: {user_count}")
        print(f"   Markets: {market_count}")
        print(f"   Bets: {bet_count}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(init_betting_tables())