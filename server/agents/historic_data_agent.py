from tools.get_symbol import lookup_symbol
from tools.historic_data import get_historic_data
from base import EquityIQState
from langchain_core.messages import AIMessage


def historic_data_agent(state: EquityIQState) -> EquityIQState:
    """
    Agent to get historic data for a given symbol.
    An API or lookup failure is stored on the state so the graph keeps running.
    """
    llm_calls = state.get("llm_calls", 0) + 1
    try:
        query = (state.get("company_name") or "").strip()
        if not query:
            historical_data = "Company name not found in symbol"
            symbol = ""
        else:
            symbol = lookup_symbol(query)
            historical_data = get_historic_data(symbol)
    except Exception as exc:
        historical_data = f"Historic data search failed: {exc}"
        symbol = ""
    return {
        "symbol": symbol,
        "historical_data": historical_data,
        "messages": [AIMessage(content=str(historical_data))],
        "llm_calls": llm_calls,
    }
