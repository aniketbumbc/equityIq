# EquityIQ client

Next.js desk for the EquityIQ research server.

## Run

Start the API from `server/` first:

```bash
source venv/bin/activate
uvicorn main:app --reload
```

Then, from this folder:

```bash
npm run dev
```

Open `http://127.0.0.1:3000`. The app calls `http://127.0.0.1:8000`. Override that with `NEXT_PUBLIC_API_URL` if the API is elsewhere.

Ask a stock question. Agent cards appear as each one finishes. When the draft is ready, approve it, send revision feedback, or reject it. The server process has to stay running between the question and the review, because the run is kept in memory.
