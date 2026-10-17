from tools.get_symbol import lookup_symbol
from tools.technical_indicator import get_technical_indicators
from base import EquityIQState
from langchain_core.messages import AIMessage


def technical_indicator_agent(state: EquityIQState) -> EquityIQState:
    """
    Technical indicator agent fetches RSI, MACD, and ATR for the company in the user query.
    An API or lookup failure is stored on the state so the graph keeps running.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    try:
        query = state.get("user_query", "")
        if not query:
            technical_indicator = "No technical indicator query provided"
        else:
            symbol = lookup_symbol(query)
            technical_indicator = get_technical_indicators(symbol)
    except Exception as exc:
        technical_indicator = f"Technical indicator search failed: {exc}"
    return {
        "technical_indicator": technical_indicator,
        "messages": [AIMessage(content=str(technical_indicator))],
        "llm_calls": llm_calls,
    }
