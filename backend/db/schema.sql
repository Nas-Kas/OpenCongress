-- === Core tables ===

CREATE TABLE IF NOT EXISTS members (
  bioguide_id TEXT PRIMARY KEY,
  name        TEXT,
  party       TEXT,
  state       TEXT,
  image_url   TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS house_votes (
  congress            INT  NOT NULL,
  session             INT  NOT NULL,
  roll                INT  NOT NULL,
  chamber             TEXT NOT NULL DEFAULT 'House', -- future-proof for Senate
  question            TEXT,
  result              TEXT,
  started             TIMESTAMPTZ,
  legislation_type    TEXT,
  legislation_number  TEXT,
  source              TEXT,
  legislation_url     TEXT,
  -- cached counts for fast UI
  yea_count           INT,
  nay_count           INT,
  present_count       INT,
  not_voting_count    INT,
  PRIMARY KEY (congress, session, roll)
);

CREATE INDEX IF NOT EXISTS house_votes_started_idx    ON house_votes (started DESC);
CREATE INDEX IF NOT EXISTS house_votes_bill_idx       ON house_votes (legislation_type, legislation_number);
CREATE INDEX IF NOT EXISTS house_votes_bill_ch_idx    ON house_votes (chamber, legislation_type, legislation_number, started DESC);

CREATE TABLE IF NOT EXISTS house_vote_members (
  congress    INT  NOT NULL,
  session     INT  NOT NULL,
  roll        INT  NOT NULL,
  chamber     TEXT NOT NULL DEFAULT 'House',
  bioguide_id TEXT NOT NULL,
  vote_state  TEXT,
  vote_party  TEXT,
  position    TEXT,  -- normalized: Yea/Nay/Present/Not Voting
  PRIMARY KEY (congress, session, roll, bioguide_id),
  FOREIGN KEY (congress, session, roll) REFERENCES house_votes (congress, session, roll) ON DELETE CASCADE,
  FOREIGN KEY (bioguide_id) REFERENCES members (bioguide_id)
);

CREATE INDEX IF NOT EXISTS house_vote_members_bioguide_idx ON house_vote_members (bioguide_id);
CREATE INDEX IF NOT EXISTS house_vote_members_position_idx ON house_vote_members (position);

CREATE TABLE IF NOT EXISTS bills (
  congress       INT  NOT NULL,
  bill_type      TEXT NOT NULL,   -- lowercased: hr/hres/hjres/...
  bill_number    TEXT NOT NULL,   -- TEXT to be safe with any formats
  title          TEXT,
  introduced_date DATE,
  latest_action  JSONB,
  public_url     TEXT,
  updated_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (congress, bill_type, bill_number)
);

CREATE TABLE IF NOT EXISTS bill_text_versions (
  congress    INT  NOT NULL,
  bill_type   TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  version_type TEXT NOT NULL,     -- e.g., 'Introduced', 'Engrossed'
  url         TEXT,
  PRIMARY KEY (congress, bill_type, bill_number, version_type),
  FOREIGN KEY (congress, bill_type, bill_number)
    REFERENCES bills (congress, bill_type, bill_number)
    ON DELETE CASCADE
);

-- Track ingestion progress for full backfills
CREATE TABLE IF NOT EXISTS ingestion_checkpoints (
  feed        TEXT PRIMARY KEY,   -- e.g., 'house-vote-119-1'
  last_offset INT DEFAULT 0,
  last_run_at TIMESTAMPTZ DEFAULT now()
);

-- Cache for AI-generated bill summaries
CREATE TABLE IF NOT EXISTS bill_summaries (
  congress    INT  NOT NULL,
  bill_type   TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  summary     JSONB NOT NULL,  -- Store structured AI summary
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (congress, bill_type, bill_number),
  FOREIGN KEY (congress, bill_type, bill_number) 
    REFERENCES bills (congress, bill_type, bill_number) 
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bill_summaries_created_idx ON bill_summaries (created_at DESC);

-- === Betting System Tables ===

CREATE TABLE IF NOT EXISTS users (
  user_id     SERIAL PRIMARY KEY,
  username    TEXT UNIQUE NOT NULL,
  email       TEXT UNIQUE,
  balance     DECIMAL(10,2) DEFAULT 1000.00, -- Starting balance
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS betting_markets (
  market_id       SERIAL PRIMARY KEY,
  congress        INT NOT NULL,
  bill_type       TEXT NOT NULL,
  bill_number     TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  market_type     TEXT NOT NULL DEFAULT 'bill_passage', -- 'bill_passage', 'member_vote', 'vote_count', 'timeline'
  status          TEXT NOT NULL DEFAULT 'active', -- 'active', 'resolved', 'cancelled'
  resolution      TEXT, -- 'pass', 'fail', 'withdrawn', etc.
  deadline        TIMESTAMPTZ, -- When betting closes
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  -- Additional fields for different market types
  target_member   TEXT, -- bioguide_id for member_vote markets
  target_count    INT,  -- target vote count for vote_count markets
  target_date     DATE, -- target date for timeline markets
  FOREIGN KEY (congress, bill_type, bill_number) 
    REFERENCES bills (congress, bill_type, bill_number)
);

CREATE INDEX IF NOT EXISTS betting_markets_bill_idx ON betting_markets (congress, bill_type, bill_number);
CREATE INDEX IF NOT EXISTS betting_markets_status_idx ON betting_markets (status);

CREATE TABLE IF NOT EXISTS bets (
  bet_id      SERIAL PRIMARY KEY,
  market_id   INT NOT NULL,
  user_id     INT NOT NULL,
  position    TEXT NOT NULL, -- 'yes', 'no', 'pass', 'fail', 'over', 'under', etc.
  amount      DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  odds        DECIMAL(5,2), -- Odds at time of bet (e.g., 1.50 for 3:2)
  potential_payout DECIMAL(10,2), -- amount * odds
  status      TEXT NOT NULL DEFAULT 'active', -- 'active', 'won', 'lost', 'refunded'
  placed_at   TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  FOREIGN KEY (market_id) REFERENCES betting_markets (market_id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bets_market_idx ON bets (market_id);
CREATE INDEX IF NOT EXISTS bets_user_idx ON bets (user_id);
CREATE INDEX IF NOT EXISTS bets_status_idx ON bets (status);

CREATE TABLE IF NOT EXISTS market_odds (
  market_id   INT NOT NULL,
  position    TEXT NOT NULL, -- 'yes', 'no', 'pass', 'fail', 'over', 'under'
  odds        DECIMAL(5,2) NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (market_id, position),
  FOREIGN KEY (market_id) REFERENCES betting_markets (market_id) ON DELETE CASCADE
);

-- Table for speculative/future bills that don't exist in the main bills table yet
CREATE TABLE IF NOT EXISTS speculative_bills (
  spec_bill_id    SERIAL PRIMARY KEY,
  congress        INT NOT NULL,
  bill_type       TEXT NOT NULL,
  bill_number     TEXT NOT NULL,
  title           TEXT,
  description     TEXT,
  expected_intro_date DATE,
  created_by      INT, -- user who created this speculative bill
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(congress, bill_type, bill_number),
  FOREIGN KEY (created_by) REFERENCES users (user_id)
);
