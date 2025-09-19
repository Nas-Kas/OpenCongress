---
inclusion: always
---

# Congressional Bill Analysis & Betting Platform

This project combines AI-powered bill analysis with prediction markets for legislative outcomes.

## Core Components

### AI Bill Summarizer
- **BillPlainSummarizer**: OpenAI-powered structured summaries with importance scoring
- **BillTextScraper**: Comprehensive text extraction from Congress.gov, APIs, and PDFs
- **Analysis Features**: Section extraction, financial info, key phrases, definitions
- **Output**: Markdown summaries with TL;DR, bullets, and reading time estimates

### Betting Platform
- Prediction markets for bill outcomes
- Early-stage betting on bills without votes
- Achievement system for user engagement
- Market creation for various legislative events

### Data Sources
- Congress.gov API for bill metadata and votes
- GovInfo API for structured USLM XML
- PDF text extraction with PyMuPDF
- PostgreSQL database for caching and performance

## Technical Stack
- **Backend**: FastAPI with Python, asyncpg for PostgreSQL
- **Frontend**: React with modern hooks and state management
- **AI**: OpenAI GPT-4o-mini for summarization
- **Data**: Congress API, GovInfo API, web scraping

## Key Endpoints
- `/bill/{congress}/{bill_type}/{bill_number}/generate-summary` - AI summarization
- `/bills/no-votes` - Bills without House votes (betting opportunities)
- `/house/votes` - Roll call vote data
- `/betting/*` - Prediction market endpoints

## Development Principles
- Performance-first with database caching
- Graceful API fallbacks
- Comprehensive error handling
- User-friendly interfaces with educational tooltips