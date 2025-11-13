# backend
## Mac
- cd backend
- python -m venv .venv
- source .venv/bin/activate
- uvicorn main:app --reload --port 8000
## Windows
- cd backend
- python -m venv .venv
- source .venv/Scripts/activate
- pip install -r requirements.txt
- uvicorn main:app --reload --port 8000

# frontend
- cd frontend
- npm ci
- npm start


# ingest
- full reset
- python ingest.py --congress 118 --session 2 --mode update --reset-all

- full ingest
- python ingest.py --congress 118 --session 2 --mode full --batch-size 200 --workers 2


- complete archive
- python ingest.py --congress 118 --session 2 --mode full --workers 2


lightweight
- python ingest.py --congress 118 --session 2 --mode update


python ingest.py --congress 119 --session 1 --mode update \                
  --limit-recent 500 --workers 1 --no-enrich-member-images


  python ingest.py --congress 119 --session 1 --mode full --reset-all --workers 1 --enrich-limit 5000


# ingesting bills even without votes

- python ingest_bills.py --congress 118
- 
500 most recent
- python ingest_bills.py --congress 118 --mode recent --limit 500

100 house and senate bills
- python ingest_bills.py --congress 118 --mode by-type --bill-types hr s --limit-per-type 100
