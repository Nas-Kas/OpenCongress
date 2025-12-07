-- === Extensions ===

-- Enable pgvector for RAG embeddings
CREATE EXTENSION IF NOT EXISTS vector;

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
  subject_bill_type   TEXT,  -- The actual bill when legislation_type is a procedural rule (HRES)
  subject_bill_number TEXT,  -- The actual bill number when legislation_type is a procedural rule
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
CREATE INDEX IF NOT EXISTS house_votes_subject_bill_idx ON house_votes (subject_bill_type, subject_bill_number);

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

-- === RAG System Tables ===

-- Store bill text chunks with embeddings for semantic search
CREATE TABLE IF NOT EXISTS bill_chunks (
  chunk_id    SERIAL PRIMARY KEY,
  congress    INT NOT NULL,
  bill_type   TEXT NOT NULL,
  bill_number TEXT NOT NULL,
  chunk_index INT NOT NULL,  -- Order of chunk in the bill
  text        TEXT NOT NULL,  -- The actual chunk text
  embedding   VECTOR(768),    -- Gemini embedding dimension
  created_at  TIMESTAMPTZ DEFAULT now(),
  FOREIGN KEY (congress, bill_type, bill_number) 
    REFERENCES bills (congress, bill_type, bill_number) 
    ON DELETE CASCADE,
  UNIQUE (congress, bill_type, bill_number, chunk_index)
);

-- Index for vector similarity search
CREATE INDEX IF NOT EXISTS bill_chunks_embedding_idx ON bill_chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Index for filtering by bill
CREATE INDEX IF NOT EXISTS bill_chunks_bill_idx ON bill_chunks (congress, bill_type, bill_number);

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
