import json
from collections.abc import Iterator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from langgraph.types import Command
from pydantic import BaseModel, Field

from graph import graph

app = FastAPI(title="EquityIQ")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

PUBLIC_KEYS = (
    "user_query",
    "company_name",
    "symbol",
    "company_news",
    "market_sentiment",
    "historical_data",
    "technical_indicator",
    "analysis_results",
    "final_response",
    "guardrails_allowed",
    "guardrails_reason",
    "selected_agents",
    "supervisor_reasoning",
    "approved",
    "human_feedback",
    "rerun_agents",
    "data_settings",
    "revision_reasoning",
)


class AnalyzeRequest(BaseModel):
    query: str = Field(..., min_length=1, examples=["Should I buy Apple stock"])


class ResumeRequest(BaseModel):
    thread_id: str = Field(..., min_length=1)
    approved: bool = False
    feedback: str = ""


def _config(thread_id: str) -> dict:
    return {"configurable": {"thread_id": thread_id}}


def _jsonable(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_jsonable(item) for item in value]
    return str(value)


def _event(payload: dict) -> str:
    return f"data: {json.dumps(_jsonable(payload))}\n\n"


def _review_value(interrupts):
    if not interrupts:
        return None
    first = interrupts[0]
    return getattr(first, "value", first)


def _stream(graph_input, thread_id: str) -> Iterator[str]:
    config = _config(thread_id)
    saw_review = False
    try:
        for chunk in graph.stream(graph_input, config, stream_mode="updates"):
            if not isinstance(chunk, dict):
                continue
            if "__interrupt__" in chunk:
                saw_review = True
                yield _event({
                    "status": "needs_review",
                    "thread_id": thread_id,
                    "review": _review_value(chunk["__interrupt__"]),
                })
                continue
            for node, update in chunk.items():
                if not isinstance(update, dict):
                    update = {"value": update}
                yield _event({
                    "node": node,
                    **{key: update[key] for key in PUBLIC_KEYS if key in update},
                })
        if saw_review:
            return
        snapshot = graph.get_state(config)
        if snapshot.interrupts:
            yield _event({
                "status": "needs_review",
                "thread_id": thread_id,
                "review": _review_value(snapshot.interrupts),
            })
            return
        values = snapshot.values or {}
        yield _event({
            "status": "complete",
            "thread_id": thread_id,
            **{key: values.get(key) for key in PUBLIC_KEYS},
        })
    except Exception as exc:
        yield _event({"status": "error", "thread_id": thread_id, "detail": str(exc)})


def _sse(events: Iterator[str]) -> StreamingResponse:
    return StreamingResponse(
        events,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/analyze")
def analyze(body: AnalyzeRequest):
    thread_id = str(uuid4())
    return _sse(_stream(
        {
            "user_query": body.query.strip(),
            "llm_calls": 0,
            "messages": [],
        },
        thread_id,
    ))

@app.post("/api/analyze/resume")
def resume(body: ResumeRequest):
    return _sse(_stream(
        Command(resume={"approved": body.approved, "feedback": body.feedback}),
        body.thread_id,
    ))
