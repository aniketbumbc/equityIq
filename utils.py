import JSON
from langchain_core.messages import SystemMessage, HumanMessage
from langchain_openai import ChatOpenAI

# need one time call so use set
KNOWN_AGENTS = {
    "company_name_agent",
    "historical_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
    "analysis_agent",
}

AGENT_ORDER = [
    "company_name_agent",
    "historical_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
    "analysis_agent",
]

def _llm_text(system_prompt:str, user_prompt:str) -> str:
    """
    Generate a text response using the LLM.
    """
    response = llm.invoke([
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ])


def _json_from_llm(text:str) -> dict[str,Any]:
    """
    Parse the JSON from the LLM response.
    """
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON found in the LLM response")

    return json.loads(text[start:end + 1])
    
def _empty_constraints() -> dict[str,Any]:
    """
    Return an empty dictionary of constraints.
    """
    return {
        "company": "",
        "historical": "",
        "news": "",
        "sentiment": "",
        "technical": "",
        "analysis": "",
        "indicator": "",
    }