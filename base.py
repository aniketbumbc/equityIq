
from typing import TypedDict,Annotated
import operator
from langchain_core.messages import AnyMessage
from pydantic import BaseModel
from typing import Any

class EquityIQState(TypedDict):
    messages:Annotated[list[AnyMessage],operator.add] #reducer object to append messages to the list
    user_query:str #user query
    company_name:str #company name extracted from the user query
    analysis_results:str #analysis results
    llm_calls:int #number of LLM calls
    historical_data:str #historical data
    company_news:str #company news
    market_sentiment:str #market sentiment
    technical_indicator:str #technical indicator
    symbol:str #ticker resolved by the symbol search API

    # supervisor + guardrails state
    guardrails_allowed:bool #guardrails allowed
    guardrails_reason:str #reason for guardrails allowed
    selected_agents:list[str] #selected agents
    supervisor_reasoning:str #reasoning for the supervisor's decision
    query_constraints:dict[str,Any] #query constraints

    #Human-in-the-loop state
    approval_request:str #approval request
    approved:bool #approved
    human_feedback:str #human feedback
    final_response:str #final response



