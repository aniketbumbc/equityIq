from langgraph.graph import END

from base import EquityIQState



AGNET_ORDER = [
    "company_name_agent",
    "historic_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
    "analyasis_agent",
    "human_in_the_loop",
    "final_response_agent",
]


ROUTE_MAP = {
    "guardrail_blocked": "guardrail_blocked",
    "company_name_agent": "company_name_agent",
    "historic_data_agent": "historic_data_agent",
    "company_news_agent": "company_news_agent",
    "market_sentiment_agent": "market_sentiment_agent",
    "technical_indicator_agent": "technical_indicator_agent",
    "analyasis_agent": "analyasis_agent",
    "human_in_the_loop": "human_in_the_loop",
    "final_response_agent": "final_response_agent",
}


def  _selected_agent(state:EquityIQState) -> list[str]:
    selected = state.get("selected_agents",[])
    return [agent for agent in AGNET_ORDER if agent in selected]


def route_from_supervisor(state:EquityIQState) -> str:
    """
    Route the request to the appropriate agent based on the supervisor's decision.
    """
    if not state.get("guardrails_allowed",True):
        return "guardrail_blocked"
    selected = _selected_agent(state)
    return selected[0] if selected else "analyasis_agent"



def route_after_agent(current_agent:str):
    def route(state:EquityIQState) -> str:
        selected = _selected_agent(state)
        current_index = AGNET_ORDER.index(current_agent)

        for next_agent in AGNET_ORDER[current_index + 1:]:
            if next_agent in selected and next_agent not in {
                "human_in_the_loop",
                "final_response_agent",
            }:
                return next_agent
        if current_agent == "analyasis_agent":
            return "human_in_the_loop"
        return "analyasis_agent"
    return route


def route_from_human(state:EquityIQState) -> str:
    """
    An approval or revision feedback goes to the final report.
    A rejection with no feedback stops the graph.
    """
    if state.get("approved", False):
        return "final_response_agent"
    if (state.get("human_feedback") or "").strip():
        return "final_response_agent"
    return END