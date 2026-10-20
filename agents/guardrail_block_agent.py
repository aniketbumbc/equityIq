from server.utils import EquityIQState

from langchain_core.messages import AIMessage
def guardrail_block_agent(state:EquityIQState):
    reason = state.get("final_response") or  state.get("guardrail_reason") or ("This request wass blokced by the guardrail agent.")
    return {
       "final_response":reason,
       "messages":[AIMessage(content=reason)],
    }