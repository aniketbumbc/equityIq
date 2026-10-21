from server.utils import EquityIQState
from langchain_core.messages import AIMessage
from langgraph.types import interrupt,CommandMessage



def human_inloop_agent(state:EquityIQState):
    review = interrupt(
        {
            "question":"Do you approve of the draft analysis?",
            "draft_analysis":state.get("analysis_results",""),
            "approval_request":state.get("approval_request",""),
            "selected_agents":state.get("selected_agents",[]),
            "supervisor_reasoning":state.get("supervisor_reasoning",""),
            "expected_response":{
                "approved":True,
                "feedback":"Optional revision or feedback."
            }
        }
    )

    approved = bool(review.get("approved",False))
    human_feedback = str(review.get("feedback","")).strip()
    return {
        "approved":approved,
        "human_feedback":human_feedback,
        "messages":[
            AIMessage(content=f"Human in-loop review complete. Approved: {approved}. Feedback: {human_feedback}.")
        ],
        "llm_calls":state.get("llm_calls",0) + 1
    }