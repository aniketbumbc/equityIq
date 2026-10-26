from langchain_core.messages import AIMessage

from base import EquityIQState
from utils import _json_from_llm, _llm_text

RERUNNABLE_AGENTS = [
    "historic_data_agent",
    "company_news_agent",
    "market_sentiment_agent",
    "technical_indicator_agent",
]
HISTORY_INTERVALS = {"1day", "1week", "1month"}
MAX_HISTORY_YEARS = 10


def _years(value):
    try:
        years = int(value)
    except (TypeError, ValueError):
        return None
    return min(max(years, 1), MAX_HISTORY_YEARS)


def _focus(value) -> str:
    return str(value or "").strip()[:120]


def revision_planner(state: EquityIQState) -> EquityIQState:
    """
    Read the reviewer's feedback and choose which research agents to run again, and with what settings.
    Agents that are not chosen keep their earlier results. A planner failure re-runs nothing.
    """
    feedback = (state.get("human_feedback") or "").strip()
    llm_calls = state.get("llm_calls", 0) + 1
    settings = dict(state.get("data_settings") or {})

    planner_prompt = f"""
    The user reviewed a draft stock analysis and asked for a revision.
    Decide which research agents must fetch data again to satisfy the feedback.
    Only choose an agent when the feedback needs new or different data from it.
    Feedback about wording, tone, horizon, or how to weigh existing evidence needs no agent.

    Research agents:
    - historic_data_agent: Price history. Settings: history_years (1 to {MAX_HISTORY_YEARS}), history_interval ("1day", "1week", "1month"). Current: {settings.get("history_years") or 1} year(s), {settings.get("history_interval") or "1day"}.
    - company_news_agent: Web search for company news. Setting: news_focus, a few words added to the search, for example "earnings" or "AI chips".
    - market_sentiment_agent: Web search for broad stock-market mood. Setting: sentiment_focus, for example "tech sector" or "interest rates".
    - technical_indicator_agent: Latest RSI, MACD, and ATR with fixed periods. Re-running only refreshes the readings.

    Return strict JSON only:
    {{
        "rerun_agents": ["historic_data_agent"],
        "data_settings": {{
            "history_years": null,
            "history_interval": null,
            "news_focus": "",
            "sentiment_focus": ""
        }},
        "reasoning": "one sentence on what will be fetched again and why"
    }}
    Use null or "" for settings the feedback does not change.

    User request: {state.get("user_query", "")}
    Feedback: {feedback}
    """

    try:
        parsed = _json_from_llm(_llm_text(
            "You plan revisions for the EquityIQ research agents. Return strict JSON only.",
            planner_prompt,
        ))
        requested = parsed.get("rerun_agents", [])
        if not isinstance(requested, list):
            requested = []
        rerun_agents = [name for name in RERUNNABLE_AGENTS if name in requested]

        changes = parsed.get("data_settings") or {}
        if isinstance(changes, dict):
            years = _years(changes.get("history_years"))
            if years:
                settings["history_years"] = years
            if changes.get("history_interval") in HISTORY_INTERVALS:
                settings["history_interval"] = changes["history_interval"]
            for key in ("news_focus", "sentiment_focus"):
                if _focus(changes.get(key)):
                    settings[key] = _focus(changes[key])
        reasoning = str(parsed.get("reasoning", "")).strip()
    except Exception as exc:
        print(f"Error in revision planner: {exc}")
        rerun_agents = []
        reasoning = "The draft was revised from the data already gathered."

    return {
        "rerun_agents": rerun_agents,
        "data_settings": settings,
        "revision_reasoning": reasoning,
        "messages": [AIMessage(content=f"Revision plan: re-run {rerun_agents or 'no agents'}. {reasoning}")],
        "llm_calls": llm_calls,
    }
