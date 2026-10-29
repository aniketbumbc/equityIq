from langchain_core.messages import AIMessage

from base import EquityIQState
from routing import AGNET_ORDER
from utils import _empty_constraints, _json_from_llm, _llm_text

SELECTABLE_AGENTS = [
    name
    for name in AGNET_ORDER
    if name not in {"human_in_the_loop", "final_response_agent"}
]
# Research tools a user can pick directly. The company name and analysis agents always run with them.
USER_TOOLS = [
    "historic_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
]


def _as_bool(value, default: bool = True) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "yes", "1"}:
            return True
        if lowered in {"false", "no", "0"}:
            return False
    return default


def supervisor(state: EquityIQState) -> EquityIQState:
    """Allow stock questions, then choose which agents should run."""
    query = (state.get("user_query") or "").strip()
    llm_calls = state.get("llm_calls", 0)

    guardrails_prompt = f"""
    Determine if the user's query is a valid request belongs to Share Market Analysis or stock
    related query. Valid requests are:
    - Share Market Analysis
    - Stock related queries
    - Company news related queries
    - Company financials related queries
    - Company valuation related queries
    - Company performance related queries
    - Company management related queries
    - Company industry related queries
    - Company sector related queries
    - Current market trends related queries
    - Technical analysis related queries.

    Block clearly unrelated requests and requests asking for harmful information or illegal instrcation.
    DO NOT BLOCK STOCK RELATED QUERIES OR COMPANY RELATED QUERIES.

    Return strict JSON only:
    {{
        "allowed_request": true,
        "reason": "reason for the decision"
    }}

    User request: {query}
    """

    try:
        guardrails_response_raw = _llm_text(
            "You are the input guardrails for the user's request. Return strict JSON only.",
            guardrails_prompt,
        )
        guardrails_result = _json_from_llm(guardrails_response_raw)
        allowed_request = _as_bool(guardrails_result.get("allowed_request", True))
        guardrails_reason = str(guardrails_result.get("reason", "")).strip()
    except Exception as exc:
        print(f"Error in guardrails: {exc}")
        allowed_request = True
        guardrails_reason = "Guardrails validation fallback allowed the request."

    llm_calls += 1
    if not allowed_request:
        reason = guardrails_reason or (
            "EquityIQ is not designed to answer this request. "
            "Please ask about share market analysis or a stock."
        )
        return {
            "guardrails_allowed": False,
            "guardrails_reason": reason,
            "selected_agents": [],
            "query_constraints": _empty_constraints(),
            "supervisor_reasoning": reason,
            "final_response": reason,
            "messages": [AIMessage(content=f"Guardrails validation failed. {reason}")],
            "llm_calls": llm_calls,
        }

    requested = [name for name in USER_TOOLS if name in (state.get("requested_agents") or [])]
    if requested:
        return {
            "guardrails_allowed": True,
            "guardrails_reason": guardrails_reason,
            "selected_agents": ["company_name_agent", *requested, "analyasis_agent"],
            "query_constraints": _empty_constraints(),
            "supervisor_reasoning": "You chose the research tools for this question.",
            "messages": [AIMessage(content=f"Supervisor used the tools the user chose: {requested}.")],
            "llm_calls": llm_calls,
        }

    supervisor_prompt = f"""
   You are the supervisor of the EquityIQ multiagent system. Understand the user's request and the route to the different agents.

   Available agents:
   - company_name_agent: Extracts the company name from the user's request.
   - historic_data_agent: Fetches one year of daily prices for the company.
   - company_news_agent: Fetches recent company news.
   - market_sentiment_agent: Fetches broad stock-market sentiment.
   - technical_indicator_agent: Fetches RSI, MACD, and ATR.
   - analyasis_agent: Writes the forecast from the gathered evidence.

   Return strict JSON only using this schema:
   {{
    "selected_agents": ["company_name_agent", "historic_data_agent", "company_news_agent", "market_sentiment_agent", "technical_indicator_agent", "analyasis_agent"],
    "query_constraints": {{
        "company": "",
        "historical": "",
        "news": "",
        "sentiment": "",
        "technical": "",
        "analysis": "",
        "indicator": ""
    }},
    "supervisor_reasoning": "reasoning for the supervisor's decision"
    }}

    User request: {query}
    """

    try:
        supervisor_response_raw = _llm_text(
            "You are the supervisor of the EquityIQ multiagent system. Return strict JSON only.",
            supervisor_prompt,
        )
        parsed_response = _json_from_llm(supervisor_response_raw)
        requested_agents = parsed_response.get("selected_agents", [])
        if not isinstance(requested_agents, list):
            requested_agents = []
        selected_agents = [
            name for name in SELECTABLE_AGENTS if name in requested_agents
        ]
        if not selected_agents:
            selected_agents = SELECTABLE_AGENTS.copy()

        constraints = _empty_constraints()
        parsed_constraints = parsed_response.get("query_constraints", {})
        if isinstance(parsed_constraints, dict):
            constraints.update({key: parsed_constraints.get(key, "") for key in constraints})

        supervisor_reasoning = str(parsed_response.get("supervisor_reasoning", "")).strip()
        llm_calls += 1
    except Exception as exc:
        print(f"Error in supervisor: {exc}")
        selected_agents = SELECTABLE_AGENTS.copy()
        constraints = _empty_constraints()
        supervisor_reasoning = f"Supervisor validation fallback allowed the request. {exc}"
        llm_calls += 1

    return {
        "guardrails_allowed": True,
        "guardrails_reason": guardrails_reason,
        "selected_agents": selected_agents,
        "query_constraints": constraints,
        "supervisor_reasoning": supervisor_reasoning,
        "messages": [AIMessage(content="Supervisor validation allowed the request.")],
        "llm_calls": llm_calls,
    }
