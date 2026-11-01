# EquityIQ

Ask a question about a stock and get a research report. A supervisor checks the question, agents gather prices, news, market sentiment, and technical indicators, and an analysis agent writes a draft. You approve the draft, ask for a revision, or reject it before the final report is written.

## Layout

| Folder | What it is | Guide |
|---|---|---|
| `server/` | FastAPI API that runs the LangGraph agent pipeline | [server/README.md](server/README.md) |
| `client/` | Next.js website that shows each agent's output as it finishes | [client/README.md](client/README.md) |
| `deploy/` | Steps for running both on one Ubuntu VPS behind Nginx | [deploy/README.md](deploy/README.md) |

## Run locally

You need Python 3, Node.js 20.9 or newer, and API keys for OpenAI, Twelve Data, Tavily, and Alpha Vantage.

1. Start the API. Set up `server/.env` from `server/.env.example` first, as described in [server/README.md](server/README.md).

   ```bash
   cd server
   source venv/bin/activate
   uvicorn main:app --reload
   ```

2. In another terminal, start the website:

   ```bash
   cd client
   npm install
   npm run dev
   ```

3. Open `http://127.0.0.1:3000`.

To put it on a server, follow [deploy/README.md](deploy/README.md).
