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
    "revision_planner": "revision_planner",
    "final_response_agent": "final_response_agent",
    END: END,
}


def  _selected_agent(state:EquityIQState) -> list[str]:
    # During a revision only the agents the planner chose run again.
    selected = state.get("rerun_agents") or state.get("selected_agents",[])
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
        # No company in the question: stop here so no other agent runs.
        if state.get("stop_reason"):
            return END
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
    An approval goes to the final report.
    Revision feedback goes to the revision planner, which re-runs the agents it needs,
    then the analysis agent writes a new draft and pauses for review again.
    A rejection with no feedback stops the graph.
    """
    if state.get("approved", False):
        return "final_response_agent"
    if (state.get("human_feedback") or "").strip():
        return "revision_planner"
    return END


def route_from_planner(state:EquityIQState) -> str:
    """Start with the first agent to re-run, or go straight to a new draft."""
    rerun = [agent for agent in AGNET_ORDER if agent in (state.get("rerun_agents") or [])]
    return rerun[0] if rerun else "analyasis_agent"