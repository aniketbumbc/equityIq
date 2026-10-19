from tools.get_symbol import lookup_symbol
from tools.technical_indicator import get_technical_indicators
from base import EquityIQState
from langchain_core.messages import AIMessage

#technical_indicator_agent is a function that takes a state and returns a state
def technical_indicator_agent(state: EquityIQState) -> EquityIQState:
    """
    Technical indicator agent fetches RSI, MACD, and ATR for the company in the user query.
    An API or lookup failure is stored on the state so the graph keeps running.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    try:
        symbol = (state.get("symbol") or "").strip()
        if not symbol:
            history = state.get("historical_data")
            if isinstance(history, dict):
                symbol = ((history.get("meta") or {}).get("symbol") or "").strip()
        if not symbol:
            query = (state.get("user_query") or "").strip()
            if not query:
                technical_indicator = "No technical indicator query provided"
            else:
                symbol = lookup_symbol(query)
                technical_indicator = get_technical_indicators(symbol)
        else:
            technical_indicator = get_technical_indicators(symbol)
    except Exception as exc:
        technical_indicator = f"Technical indicator search failed: {exc}"
    return {
        "technical_indicator": technical_indicator,
        "messages": [AIMessage(content=str(technical_indicator))],
        "llm_calls": llm_calls,
    }
