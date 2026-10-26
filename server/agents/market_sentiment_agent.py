from tools.tavily_tool import search_tavily
from base import EquityIQState
from langchain_core.messages import AIMessage


def market_sentiment_agent(state: EquityIQState) -> EquityIQState:
    """
    Market sentiment agent is responsible for finding the best market sentiment for the user.
    An API failure is stored on the state so the graph keeps running.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    try:
        focus = ((state.get("data_settings") or {}).get("sentiment_focus") or "").strip()
        question = "What is the market sentiment for the stock market?"
        market_sentiment = search_tavily(f"{question} Focus: {focus}" if focus else question)
    except Exception as exc:
        market_sentiment = f"Market sentiment search failed: {exc}"
    return {
        "market_sentiment": market_sentiment,
        "messages": [AIMessage(content=str(market_sentiment))],
        "llm_calls": llm_calls,
    }
