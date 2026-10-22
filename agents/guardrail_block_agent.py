from langchain_core.messages import AIMessage

from base import EquityIQState

def guardrail_block_agent(state:EquityIQState):
    reason = state.get("final_response") or state.get("guardrails_reason") or "This request was blocked by the guardrail agent."
    return {
       "final_response":reason,
       "messages":[AIMessage(content=reason)],
    }