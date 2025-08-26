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
