from server.base import EquityIQState
from server.utils import _llm_text, _json_from_llm, _empty_constraints, KNOWN_AGENTS, AGENT_ORDER

def analyasis_agent(state:EquityIQState):
    query = state["query"]
    llm_calls = state.get("llm_calls", 0)

    guardrails_prompt = f"""
    Determine if the user's query is a valid request belongs to Share Market Analysis or stock
    related query. Valid requests are:
    - Share Market Analysis
    - Stock related queries
    - Company news related queries
    - Company financials related queries
    - Company valuation related queries
    - Company performance related queries
    - Company management related queries
    - Company industry related queries
    - Company sector related queries
    - Current market trends related queries
    - Technical analysis related queries.

    Block clearly unrelated requests and requests asking for harmful information or illegal instrcation.
    DO NOT BLOCK STOCK RELATED QUERIES OR COMPANY RELATED QUERIES.

    Return strict JSON only:
    {{
        "allowed_request": true | false,
        "reason": "reason for the decision"
    }}

    User request: {query}
    """

    try:
        guardrails_response_raw = _llm_text("You are the input guardrails for the user's request. Return strict JSON only.", guardrails_prompt)
        guardrails_result = _json_from_llm(guardrails_response_raw)
        allowed_request = bool(guardrails_result.get("allowed_request", True))
        guardrails_reason = str(guardrails_result.get("reason", "")).strip()
    except Exception as e:
        print(f"Error in guardrails: {e}")
        allowed_request = True
        guardrails_reason = "Guardrails validation fallback allowed the request."

    if not allowed_request:
        reason = guardrails_reason or (" EquityIQ is not designed to answer this request. "
                                      "Please try a different request. Please ask about valid share market analysis or stock related queries.")

    return {
        "guardrail_allowed":False,
        "guardrail_reason":reason,
        "llm_calls":llm_calls + 1,
        "selected_agent":[],
        "query_constraints": _empty_constraints(),
        "supervisor_reasoning":reason,
        "final_response":reason,
        "messages":[AIMessage(content=f"Guardrails validation failed. {reason}")],
        "llm_calls":llm_calls + 1,
    }
    
    supervisor_prompt = f"""
   You are the supervisor of the EquityIQ multiagent system. Understand the user's request and the route to the different agents.

   Available agents:
   - company_name_agent: Extracts the company name from the user's request.
   - historical_data_agent: Extracts historical data from the company's financial statements and other relevant sources.
   - company_news_agent: Extracts company news from the internet and other relevant sources.
   - market_sentiment_agent: Extracts market sentiment from the internet and other relevant sources.
   - technical_indicator_agent: Extracts technical indicators from the company's financial statements and other relevant sources.
   - analysis_agent: Analyzes the company's financial statements and other relevant sources.

   Return strict JSON only using this schema:
   {{
    "selected_agents": ["company_name_agent", "historical_data_agent", "company_news_agent", "market_sentiment_agent", "technical_indicator_agent", "analysis_agent"],
    "query_constraints":{{
        "company": "",
        "historical": "",
        "news": "",
        "sentiment": "",
        "technical": "",
        "analysis": "",
        "indicator": "",
    }},
    "supervisor_reasoning": "reasoning for the supervisor's decision",
    }}

    User request: {query}
    """

    try:
        supervisor_response_raw = _llm_text("You are the supervisor of the EquityIQ multiagent system. Return strict JSON only using this schema.", supervisor_prompt)
        parsed_response = _json_from_llm(supervisor_response_raw)
        requested_agents = parsed_response.get("selected_agents", [])
        selected_agents = [
            name for name in AGENT_ORDER
            if name in requested_agents and name in KNOWN_AGENTS
        ]       

        if "analysis_agent" in selected_agents:
            selected_agents.append("analysis_agent")

        constraints = _empty_constraints()
        parsed_constraints = parsed_response.get("query_constraints",{})
        if isinstance(parsed_constraints, dict):
            constraints.update(parsed_constraints)
        
        supervisor_reasoning = str(parsed_response.get("supervisor_reasoning", "")).strip()
        llm_calls = llm_calls + 1
        final_response = str(parsed_response.get("final_response", "")).strip()
    except Exception as e:
        print(f"Error in supervisor: {e}")
        selected_agents = AGENT_ORDER.copy()
        constraints = _empty_constraints()
        supervisor_reasoning = (f"Supervisor validation fallback allowed the request. {e}")
    
    return {
        "guardrail_allowed":True,
        "guardrail_reason":guardrails_reason,
        "selected_agents":selected_agents,
        "query_constraints":constraints,
        "supervisor_reasoning":supervisor_reasoning,
        "final_response":final_response,
        "messages":[AIMessage(content=f"Supervisor validation allowed the request.")],
        "llm_calls":llm_calls,
    }
