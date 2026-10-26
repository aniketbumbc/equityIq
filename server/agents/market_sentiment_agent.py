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
        market_sentiment = search_tavily("What is the market sentiment for the stock market?")
    except Exception as exc:
        market_sentiment = f"Market sentiment search failed: {exc}"
    return {
        "market_sentiment": market_sentiment,
        "messages": [AIMessage(content=str(market_sentiment))],
        "llm_calls": llm_calls,
    }
