from tools.tavily_tool import search_tavily
from base import EquityIQState
from langchain_core.messages import AIMessage


def company_news_agent(state: EquityIQState) -> EquityIQState:
    """
    Company news agent is responsible for finding the best company news for the user.
    An API failure is stored on the state so the graph keeps running.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    try:
        query = (state.get("company_name") or state.get("user_query") or "").strip()
        if not query:
            company_news = "No company news query provided"
        else:
            focus = ((state.get("data_settings") or {}).get("news_focus") or "").strip()
            company_news = search_tavily(f"{query} {focus}".strip())
    except Exception as exc:
        company_news = f"Company news search failed: {exc}"
    return {
        "company_news": company_news,
        "messages": [AIMessage(content=str(company_news))],
        "llm_calls": llm_calls,
    }
