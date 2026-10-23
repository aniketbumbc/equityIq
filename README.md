# EquityIQ server

FastAPI service that answers a stock question with a LangGraph pipeline. A supervisor checks the question, selected agents gather prices, news, sentiment, and indicators, and the run pauses so a person can approve or revise the draft before the final report.

## Setup

From this directory:

```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create a `.env` file here. The server reads these variables:

| Variable | Used for |
|---|---|
| `OPENAI_API_KEY` | Company-name extraction, supervisor, analysis, and the final report |
| `TWELVEDATA_API_KEY` | Symbol search, one year of daily prices, MACD, and ATR |
| `TAVILY_API_KEY` | Company news and broad market sentiment |
| `ALPHAVANTAGE_API_KEY` | Monthly RSI. MACD and ATR still return if this is missing |

Do not commit `.env`.

## Run

```bash
source venv/bin/activate
uvicorn main:app --reload
```

The app listens on `http://127.0.0.1:8000`. Interactive docs are at `http://127.0.0.1:8000/docs`.

## Endpoints

### `POST /api/analyze`

Start a run.

```bash
curl -s -X POST "http://127.0.0.1:8000/api/analyze" \
  -H "Content-Type: application/json" \
  -d '{"query":"Should I buy Apple stock"}'
```

A normal stock question returns:

```json
{
  "status": "needs_review",
  "thread_id": "...",
  "review": {
    "question": "Do you approve of the draft analysis?",
    "draft_analysis": "{ ... forecast JSON ... }"
  }
}
```

Copy `thread_id`. The first call can take a minute because it calls the data providers and the model.

A question that is not about the stock market returns `"status": "complete"` with the block reason in `final_response`.

### `POST /api/analyze/resume`

Continue the same run. The server process must still be the one that started it.

Approve the draft:

```bash
curl -s -X POST "http://127.0.0.1:8000/api/analyze/resume" \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"PASTE_THREAD_ID","approved":true,"feedback":""}'
```

Request a revision:

```bash
curl -s -X POST "http://127.0.0.1:8000/api/analyze/resume" \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"PASTE_THREAD_ID","approved":false,"feedback":"Make the forecast horizon 30 days"}'
```

Reject it:

```bash
curl -s -X POST "http://127.0.0.1:8000/api/analyze/resume" \
  -H "Content-Type: application/json" \
  -d '{"thread_id":"PASTE_THREAD_ID","approved":false,"feedback":""}'
```

Approval and revision return `"status": "complete"` and a `final_response` JSON report. A rejection with empty feedback ends the run without that report. Each test needs a new `thread_id` from `/api/analyze`.

## Pipeline

1. **Supervisor** decides whether the question is about stocks and which agents to run.
2. **Company name** turns the question into a company name, for example `Apple`.
3. **Historic data** looks up the ticker and loads one year of daily prices.
4. **Company news** searches recent news for that company.
5. **Market sentiment** searches the broad stock-market mood.
6. **Technical indicators** load monthly RSI, monthly MACD, and daily ATR.
7. **Analysis** writes a JSON forecast draft.
8. **Human review** pauses until `/api/analyze/resume`.
9. **Final response** polishes an approved draft, or applies the feedback, and returns the report.

The saved run is in memory. Restarting the server drops every `thread_id`.
