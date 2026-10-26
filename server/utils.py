import json
import os
from pathlib import Path
from typing import Any
from dotenv import load_dotenv
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

load_dotenv(Path(__file__).resolve().parent / ".env")

llm = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o-mini")

KNOWN_AGENTS = {
    "company_name_agent",
    "historic_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
    "analyasis_agent",
}

AGENT_ORDER = [
    "company_name_agent",
    "historic_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
    "analyasis_agent",
]


def _llm_text(system_prompt: str, user_prompt: str) -> str:
    """Generate a text response using the LLM."""
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])
    content = response.content
    if not isinstance(content, str):
        content = str(content)
    return content


def _json_from_llm(text: str) -> dict[str, Any]:
    """Parse the JSON object from an LLM response."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON found in the LLM response")
    parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, dict):
        raise ValueError("LLM response JSON must be an object")
    return parsed


def _empty_constraints() -> dict[str, Any]:
    """Return an empty dictionary of constraints."""
    return {
        "company": "",
        "historical": "",
        "news": "",
        "sentiment": "",
        "technical": "",
        "analysis": "",
        "indicator": "",
    }
