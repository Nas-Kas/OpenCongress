#!/usr/bin/env python3
"""
Create sample bets for testing the betting interface.
"""

import asyncio
import asyncpg
import os
import random
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def create_sample_bets():
    """Create some sample bets to populate the interface"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        # Get available markets
        markets = await conn.fetch("SELECT market_id FROM betting_markets WHERE status = 'active'")
        
        if not markets:
            print("❌ No active markets found. Run create_sample_markets.py first.")
            return
        
        # Get or create some demo users
        users = []
        demo_usernames = ['alice_trader', 'bob_predictor', 'charlie_analyst', 'demo_user']
        
        for username in demo_usernames:
            user_id = await conn.fetchval(
                """
                INSERT INTO users (username, balance) 
                VALUES ($1, 1000.00)
                ON CONFLICT (username) DO UPDATE SET balance = 1000.00
                RETURNING user_id
                """,
                username
            )
            users.append(user_id)
        
        print(f"👥 Created/updated {len(users)} demo users")
        
        # Create random bets
        bets_created = 0
        for market in markets:
            market_id = market['market_id']
            
            # Create 3-8 random bets per market
            num_bets = random.randint(3, 8)
            
            for _ in range(num_bets):
                user_id = random.choice(users)
                position = random.choice(['pass', 'fail'])
                amount = random.choice([10, 25, 50, 75, 100, 150, 200])
                
                # Get current odds
                odds = await conn.fetchval(
                    "SELECT odds FROM market_odds WHERE market_id = $1 AND position = $2",
                    market_id, position
                )
                
                if not odds:
                    odds = 2.0  # Default odds
                
                potential_payout = amount * odds
                
                try:
                    # Check if user has enough balance
                    balance = await conn.fetchval(
                        "SELECT balance FROM users WHERE user_id = $1", user_id
                    )
                    
                    if balance >= amount:
                        # Place the bet
                        await conn.execute(
                            "UPDATE users SET balance = balance - $1 WHERE user_id = $2",
                            amount, user_id
                        )
                        
                        bet_id = await conn.fetchval(
                            """
                            INSERT INTO bets (market_id, user_id, position, amount, odds, potential_payout)
                            VALUES ($1, $2, $3, $4, $5, $6)
                            RETURNING bet_id
                            """,
                            market_id, user_id, position, amount, odds, potential_payout
                        )
                        
                        bets_created += 1
                        
                        # Update market odds (simple version)
                        await update_market_odds(conn, market_id)
                        
                except Exception as e:
                    print(f"⚠️  Failed to create bet: {e}")
                    continue
        
        print(f"🎲 Created {bets_created} sample bets across {len(markets)} markets")
        
        # Show final stats
        total_bets = await conn.fetchval("SELECT COUNT(*) FROM bets")
        total_volume = await conn.fetchval("SELECT SUM(amount) FROM bets") or 0
        
        print(f"\n📊 Final Stats:")
        print(f"   Total bets: {total_bets}")
        print(f"   Total volume: ${total_volume:.2f}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

async def update_market_odds(conn, market_id: int):
    """Simple odds calculation based on betting volume"""
    # Get total volume for each position
    volumes = await conn.fetch(
        """
        SELECT position, COALESCE(SUM(amount), 0) as volume
        FROM bets 
        WHERE market_id = $1 AND status = 'active'
        GROUP BY position
        """,
        market_id
    )
    
    volume_dict = {row["position"]: float(row["volume"]) for row in volumes}
    pass_volume = volume_dict.get("pass", 0)
    fail_volume = volume_dict.get("fail", 0)
    total_volume = pass_volume + fail_volume
    
    if total_volume == 0:
        return  # Keep default odds
    
    # Calculate implied probabilities (with smoothing)
    smoothing = 100
    pass_prob = (pass_volume + smoothing/2) / (total_volume + smoothing)
    fail_prob = (fail_volume + smoothing/2) / (total_volume + smoothing)
    
    # Convert to odds (with house edge)
    house_edge = 0.05
    pass_odds = (1 - house_edge) / pass_prob
    fail_odds = (1 - house_edge) / fail_prob
    
    # Update odds
    await conn.execute(
        "UPDATE market_odds SET odds = $2, updated_at = now() WHERE market_id = $1 AND position = 'pass'",
        market_id, pass_odds
    )
    
    await conn.execute(
        "UPDATE market_odds SET odds = $2, updated_at = now() WHERE market_id = $1 AND position = 'fail'",
        market_id, fail_odds
    )

if __name__ == "__main__":
    asyncio.run(create_sample_bets())