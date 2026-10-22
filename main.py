from uuid import uuid4

from fastapi import FastAPI, HTTPException
from langgraph.types import Command
from pydantic import BaseModel, Field

from graph import graph

app = FastAPI(title="EquityIQ")


class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=1, examples=["Should I buy Apple stock"])


class ResumeRequest(BaseModel):
    thread_id: str = Field(..., min_length=1)
    approved: bool = False
    feedback: str = ""


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _review_payload(result: dict):
    interrupts = result.get("__interrupt__")
    if not interrupts:
        return None
    first = interrupts[0]
    return getattr(first, "value", first)


def _completed(result: dict, thread_id: str) -> dict:
    return {
        "status": "complete",
        "thread_id": thread_id,
        "query": result.get("user_query") or "",
        "company_name": result.get("company_name") or "",
        "symbol": result.get("symbol") or "",
        "company_news": result.get("company_news") or "",
        "market_sentiment": result.get("market_sentiment") or "",
        "historical_data": result.get("historical_data") or "",
        "technical_indicator": result.get("technical_indicator") or "",
        "analysis_results": result.get("analysis_results") or "",
        "final_response": result.get("final_response") or "",
        "approved": result.get("approved"),
    }


def _response(result: dict, thread_id: str) -> dict:
    review = _review_payload(result)
    if review is not None:
        return {
            "status": "needs_review",
            "thread_id": thread_id,
            "review": review,
        }
    return _completed(result, thread_id)


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    query = body.query.strip()
    thread_id = str(uuid4())
    try:
        result = graph.invoke(
            {
                "user_query": query,
                "llm_calls": 0,
                "messages": [],
            },
            _config(thread_id),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _response(result, thread_id)


@app.post("/api/analyze/resume")
def resume(body: ResumeRequest):
    try:
        result = graph.invoke(
            Command(resume={"approved": body.approved, "feedback": body.feedback}),
            _config(body.thread_id),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return _response(result, body.thread_id)
