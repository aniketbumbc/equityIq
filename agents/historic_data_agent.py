from typing import TypedDict,Annotated
from tools.get_symbol import get_symbol
from base import EquityIQState
from langchain_core.messages import AIMessage

def historic_data_agent(state: EquityIQState) -> EquityIQState:
    """
    Agent to get historic data for a given symbol
    """
    query = state.get("user_query","")
    llm_calls = state.get("llm_calls",0) + 1
   if not query:
    historical_data = "No historic data available"
   else:
        try:
            historical_data = get_symbol(query)
        except Exception as exc:
            historical_data = f"Historic data search failed: {exc}"
    return {
        "historical_data":historical_data,
        "messages":[AIMessage(content=historical_data)],
        "llm_calls":llm_calls,
    }