#!/usr/bin/env python3
"""
Create sample advanced betting markets for testing.
"""

import asyncio
import asyncpg
import os
from datetime import datetime, timedelta, date
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def create_advanced_markets():
    """Create some sample advanced betting markets"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # Get some existing bills and members
        bills = await conn.fetch(
            "SELECT congress, bill_type, bill_number, title FROM bills WHERE congress = 119 LIMIT 3"
        )
        
        members = await conn.fetch(
            "SELECT bioguide_id, name, party, state FROM members LIMIT 5"
        )
        
        if not bills or not members:
            print("❌ Need some bills and members in database first")
            return
        
        markets_created = 0
        
        # Create member vote markets
        for i, bill in enumerate(bills[:2]):  # First 2 bills
            for j, member in enumerate(members[:3]):  # First 3 members
                market_id = await conn.fetchval(
                    """
                    INSERT INTO betting_markets (
                        congress, bill_type, bill_number, title, description, 
                        market_type, target_member, deadline
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING market_id
                    """,
                    bill['congress'], bill['bill_type'], bill['bill_number'],
                    f"Will {member['name']} vote YES on {bill['bill_type'].upper()} {bill['bill_number']}?",
                    f"Predict how {member['name']} ({member['party']}-{member['state']}) will vote on this legislation.",
                    "member_vote", member['bioguide_id'], 
                    datetime.now() + timedelta(days=30)
                )
                
                # Set initial odds
                await conn.execute(
                    """
                    INSERT INTO market_odds (market_id, position, odds) VALUES
                    ($1, 'yes', 2.0),
                    ($1, 'no', 2.0)
                    """,
                    market_id
                )
                
                print(f"✅ Created member vote market {market_id}: {member['name']} on {bill['bill_type'].upper()} {bill['bill_number']}")
                markets_created += 1
        
        # Create vote count markets
        for bill in bills[:2]:
            market_id = await conn.fetchval(
                """
                INSERT INTO betting_markets (
                    congress, bill_type, bill_number, title, description,
                    market_type, target_count, deadline
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING market_id
                """,
                bill['congress'], bill['bill_type'], bill['bill_number'],
                f"Will {bill['bill_type'].upper()} {bill['bill_number']} get over 250 YES votes?",
                f"Predict whether this bill will receive more than 250 YES votes in the House.",
                "vote_count", 250,
                datetime.now() + timedelta(days=45)
            )
            
            await conn.execute(
                """
                INSERT INTO market_odds (market_id, position, odds) VALUES
                ($1, 'over', 2.0),
                ($1, 'under', 2.0)
                """,
                market_id
            )
            
            print(f"✅ Created vote count market {market_id}: {bill['bill_type'].upper()} {bill['bill_number']} over 250 votes")
            markets_created += 1
        
        # Create timeline markets
        for bill in bills[:1]:
            target_date = date.today() + timedelta(days=60)
            market_id = await conn.fetchval(
                """
                INSERT INTO betting_markets (
                    congress, bill_type, bill_number, title, description,
                    market_type, target_date, deadline
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING market_id
                """,
                bill['congress'], bill['bill_type'], bill['bill_number'],
                f"Will {bill['bill_type'].upper()} {bill['bill_number']} be voted on before {target_date.strftime('%B %d, %Y')}?",
                f"Predict whether this bill will come up for a House vote before the target date.",
                "timeline", target_date,
                datetime.now() + timedelta(days=50)
            )
            
            await conn.execute(
                """
                INSERT INTO market_odds (market_id, position, odds) VALUES
                ($1, 'before', 2.0),
                ($1, 'after', 2.0)
                """,
                market_id
            )
            
            print(f"✅ Created timeline market {market_id}: {bill['bill_type'].upper()} {bill['bill_number']} before {target_date}")
            markets_created += 1
        

        
        print(f"\n🎉 Created {markets_created} advanced betting markets!")
        
        # Show final stats
        total_markets = await conn.fetchval("SELECT COUNT(*) FROM betting_markets")
        member_vote_markets = await conn.fetchval("SELECT COUNT(*) FROM betting_markets WHERE market_type = 'member_vote'")
        vote_count_markets = await conn.fetchval("SELECT COUNT(*) FROM betting_markets WHERE market_type = 'vote_count'")
        timeline_markets = await conn.fetchval("SELECT COUNT(*) FROM betting_markets WHERE market_type = 'timeline'")
        
        print(f"\n📊 Market Types:")
        print(f"   Total markets: {total_markets}")
        print(f"   Member vote markets: {member_vote_markets}")
        print(f"   Vote count markets: {vote_count_markets}")
        print(f"   Timeline markets: {timeline_markets}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(create_advanced_markets())