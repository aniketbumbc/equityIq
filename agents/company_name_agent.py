from pathlib import Path
import os

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from base import EquityIQState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

openai_llm = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o-mini")


def company_name_agent(state: EquityIQState) -> EquityIQState:
    """
    Read the user query and return only the company name sent to the symbol API.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    query = (state.get("user_query") or "").strip()
    try:
        if not query:
            company_name = ""
        else:
            response = openai_llm.invoke([
                SystemMessage(content=(
                    "Extract the company name from the user query. "
                    "Return only the company name, nothing else. "
                    "Do not return a ticker. "
                    "If no company is named, return NONE."
                )),
                HumanMessage(content=query),
            ])
            company_name = str(response.content).strip().strip('"').splitlines()[0].strip()
            if company_name.upper() == "NONE":
                company_name = ""
    except Exception as exc:
        return {
            "company_name": query,
            "messages": [AIMessage(content=f"Company name lookup failed: {exc}")],
            "llm_calls": llm_calls,
        }
    return {
        "company_name": company_name,
        "messages": [AIMessage(content=company_name or "No company name found")],
        "llm_calls": llm_calls,
    }
