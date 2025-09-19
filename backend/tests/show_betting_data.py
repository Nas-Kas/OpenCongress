#!/usr/bin/env python3
"""
Show current betting data in the database.
"""

import asyncio
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

async def show_betting_data():
    """Display current betting data"""
    
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not found in .env file")
        return
    
    conn = await asyncpg.connect(DATABASE_URL)
    
    try:
        print("🎯 BETTING MARKETS")
        print("=" * 50)
        
        markets = await conn.fetch(
            """
            SELECT bm.market_id, bm.congress, bm.bill_type, bm.bill_number, 
                   bm.title, bm.status, bm.deadline,
                   COALESCE(SUM(b.amount), 0) as volume,
                   COUNT(b.bet_id) as bet_count
            FROM betting_markets bm
            LEFT JOIN bets b ON b.market_id = bm.market_id
            GROUP BY bm.market_id, bm.congress, bm.bill_type, bm.bill_number, 
                     bm.title, bm.status, bm.deadline
            ORDER BY bm.market_id
            """
        )
        
        for market in markets:
            print(f"Market {market['market_id']}: {market['bill_type'].upper()} {market['bill_number']}")
            print(f"  Title: {market['title'][:60]}...")
            print(f"  Status: {market['status']} | Volume: ${market['volume']:.2f} | Bets: {market['bet_count']}")
            
            # Get odds
            odds = await conn.fetch(
                "SELECT position, odds FROM market_odds WHERE market_id = $1",
                market['market_id']
            )
            odds_str = " | ".join([f"{o['position']}: {o['odds']:.2f}x" for o in odds])
            print(f"  Odds: {odds_str}")
            print()
        
        print("\n👥 USERS")
        print("=" * 50)
        
        users = await conn.fetch(
            """
            SELECT u.user_id, u.username, u.balance,
                   COUNT(b.bet_id) as total_bets,
                   COALESCE(SUM(b.amount), 0) as total_wagered
            FROM users u
            LEFT JOIN bets b ON b.user_id = u.user_id
            GROUP BY u.user_id, u.username, u.balance
            ORDER BY total_wagered DESC
            """
        )
        
        for user in users:
            print(f"{user['username']}: Balance ${user['balance']:.2f} | Bets: {user['total_bets']} | Wagered: ${user['total_wagered']:.2f}")
        
        print(f"\n📊 SUMMARY")
        print("=" * 50)
        
        stats = await conn.fetchrow(
            """
            SELECT 
                COUNT(DISTINCT bm.market_id) as total_markets,
                COUNT(DISTINCT u.user_id) as total_users,
                COUNT(b.bet_id) as total_bets,
                COALESCE(SUM(b.amount), 0) as total_volume
            FROM betting_markets bm
            CROSS JOIN users u
            LEFT JOIN bets b ON true
            """
        )
        
        print(f"Markets: {len(markets)} | Users: {len(users)} | Bets: {stats['total_bets']} | Volume: ${stats['total_volume']:.2f}")
        
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(show_betting_data())