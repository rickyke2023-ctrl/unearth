# Unearth Backend

FastAPI backend for the local-first photo curation workflow.

## Run

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

## Safety

- Original photo directories are read for scanning.
- `leave` moves files into `{root}/_unearth_staging/`.
- No permanent deletion happens unless `/api/staging/confirm` is called with `confirm=true`.
- Audit records append to `data/audit.jsonl`.

