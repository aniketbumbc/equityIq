from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from graph import graph

app = FastAPI(title="EquityIQ")


class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=1, examples=["Should I buy Apple stock"])


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    query = body.query.strip()
    try:
        result = graph.invoke({
            "user_query": query,
            "llm_calls": 0,
            "messages": [],
        })
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return {
        "query": query,
        "company_name": result.get("company_name") or "",
        "symbol": result.get("symbol") or "",
        "company_news": result.get("company_news") or "",
        "market_sentiment": result.get("market_sentiment") or "",
        "historical_data": result.get("historical_data") or "",
        "technical_indicator": result.get("technical_indicator") or "",
        "analysis_results": result.get("analysis_results") or "",
    }
