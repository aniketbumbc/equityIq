from pathlib import Path

from base import EquityIQState
from langchain_core.messages import SystemMessage,HumanMessage,AIMessage
from langchain_openai import ChatOpenAI
import os
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

openai_llm = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"),model="gpt-4o-mini")


def _summarize_history(value) -> str:
    """Return the latest close and the period range, not the full bar series."""
    try:
        if not isinstance(value, dict):
            return f"Missing. {value or 'No price history was returned.'}"
        bars = [bar for bar in value.get("values") or [] if isinstance(bar, dict)]
        if not bars:
            return "Missing. No price history was returned."
        latest = bars[0]
        oldest = bars[-1]
        highs = []
        lows = []
        for bar in bars:
            try:
                highs.append(float(bar["high"]))
                lows.append(float(bar["low"]))
            except (KeyError, TypeError, ValueError):
                continue
        symbol = (value.get("meta") or {}).get("symbol", "")
        lines = [
            f"Symbol: {symbol}",
            f"Bars: {len(bars)} daily bars from {oldest.get('datetime')} to {latest.get('datetime')}",
            f"Latest close: {latest.get('close')} on {latest.get('datetime')}",
            f"Latest open/high/low: {latest.get('open')} / {latest.get('high')} / {latest.get('low')}",
        ]
        if highs and lows:
            lines.append(f"Period high: {max(highs)}")
            lines.append(f"Period low: {min(lows)}")
        return "\n".join(lines)
    except Exception as exc:
        return f"Missing. Price history could not be summarized: {exc}"


def _latest_reading(payload, label: str) -> str:
    if not isinstance(payload, dict):
        return f"{label} missing. {payload or 'No reading was returned.'}"
    if payload.get("error"):
        return f"{label} missing. {payload['error']}"
    return ""


def _summarize_indicators(value) -> str:
    """Return the latest RSI, MACD, and ATR reading, not the full series."""
    try:
        if not isinstance(value, dict):
            return f"Missing. {value or 'No technical indicators were returned.'}"

        rsi_line = _latest_reading(value.get("rsi"), "RSI")
        if not rsi_line:
            series = (value.get("rsi") or {}).get("Technical Analysis: RSI") or {}
            if not series:
                rsi_line = "RSI missing. No readings were returned."
            else:
                date = next(iter(series))
                rsi_line = f"RSI {series[date].get('RSI')} on {date} (monthly, period 10, open)"

        macd_line = _latest_reading(value.get("macd"), "MACD")
        if not macd_line:
            macd_values = (value.get("macd") or {}).get("values") or []
            if not macd_values:
                macd_line = "MACD missing. No readings were returned."
            else:
                latest = macd_values[0]
                macd_line = (
                    f"MACD {latest.get('macd')} signal {latest.get('macd_signal')} "
                    f"histogram {latest.get('macd_hist')} on {latest.get('datetime')} (1month)"
                )

        atr_line = _latest_reading(value.get("atr"), "ATR")
        if not atr_line:
            atr_values = (value.get("atr") or {}).get("values") or []
            if not atr_values:
                atr_line = "ATR missing. No readings were returned."
            else:
                latest = atr_values[0]
                atr_line = f"ATR {latest.get('atr')} on {latest.get('datetime')} (1day, period 14)"

        return "\n".join([
            f"Symbol: {value.get('symbol', '')}",
            rsi_line,
            macd_line,
            atr_line,
        ])
    except Exception as exc:
        return f"Missing. Technical indicators could not be summarized: {exc}"


def analyasis_agent(state:EquityIQState) -> EquityIQState:
    """
    Analyasis agent is responsible for analyzing the data and providing a final response to the user.
    """

    try:
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY is not set")
        final_prompt = f"""
   Financial Market Analysis and Forecasting Agent:
   You are a financial market analysis and forecasting agent. You are given a user query and historical data, company news, market sentiment, and technical indicator.
   You need to analyze the data and provide a final response to the user.
   Your task is to analyze the provided inputs, identify relevant patterns and risks, and generate a structured, evidence-based forecast that helps users understand potential market movements.
    Inputs:
    User Request: {state.get("user_query","")}
    historical data:
    {_summarize_history(state.get("historical_data",""))}
    Company News: {state.get("company_news","")}
    Market Sentiment (broad stock-market mood, not sentiment for this company): {state.get("market_sentiment","")}
    Technical Indicator:
    {_summarize_indicators(state.get("technical_indicator",""))}

    Price history and indicators above are a summary. If a line says Missing, that input is unavailable. Do not invent its value.

    Required Output Format
Return only one JSON object with the same keys as the example. Do not add a prose report before or after the JSON.
Use null when a number is not justified by the inputs. Include a price range only when the data supports it.

Example Output:

{{
  "stock": {{
    "symbol": "RELIANCE",
    "company_name": "Reliance Industries",
    "forecast_horizon": "next_7_days"
  }},
  "forecast": {{
    "direction": "bullish",
    "confidence": "medium",
    "summary": "The available signals suggest a potential upward movement.",
    "expected_return_pct": null,
    "target_price": null,
    "forecast_range": {{
      "lower": null,
      "upper": null
    }}
  }},
  "analysis": {{
    "historical_trend": {{
      "direction": "bullish",
      "observations": [
        "Recent price trend is upward"
      ]
    }},
    "company_news": {{
      "sentiment": "positive",
      "key_factors": [
        "Positive company developments reported in the supplied news"
      ],
      "potential_impact": "May support investor sentiment"
    }},
    "market_sentiment": {{
      "overall": "bullish",
      "observations": [
        "Available sentiment data favors buyers"
      ]
    }},
    "technical_indicators": {{
      "overall_signal": "bullish",
      "signals": [
        {{
          "indicator": "RSI",
          "value": null,
          "interpretation": "Not available"
        }}
      ]
    }}
  }},
  "scenarios": {{
    "bullish": {{
      "conditions": [
        "Price momentum continues"
      ],
      "invalidation": "Momentum weakens"
    }},
    "base": {{
      "outlook": "Mild upward movement",
      "conditions": [
        "Current trend remains intact"
      ]
    }},
    "bearish": {{
      "conditions": [
        "Negative news or a technical breakdown"
      ],
      "invalidation": "Price recovers and bearish signals weaken"
    }}
  }},
  "key_levels": {{
    "support": [],
    "resistance": []
  }},
  "risks": [
    "Unexpected company news",
    "Broader market volatility"
  ],
  "data_quality": {{
    "historical_data_available": true,
    "company_news_available": true,
    "market_sentiment_available": true,
    "technical_indicators_available": true,
    "limitations": []
  }},
  "final_conclusion": "The outlook is cautiously bullish, but the forecast is uncertain.",
  "disclaimer": "Informational analysis only; not a guarantee of future performance."
}}

Rules and Constraints
Be analytical, objective, and evidence-based.
Never fabricate data, sources, news, indicator values, or market prices.
Clearly distinguish facts, interpretations, assumptions, and forecasts.
Do not treat correlation as causation.
Do not claim certainty about future market movements.
Explicitly disclose missing or conflicting data.
Do not recommend buying or selling solely because one indicator or news item appears bullish or bearish.
Do not imply that you have accessed real-time market data unless it was actually provided or retrieved.
Keep the final report clear, structured, and useful for decision-making.
Present the output as informational market analysis, not a guarantee of returns or personalized financial advice.
Final Objective: Produce the most defensible forecast possible from the available evidence, explain why that forecast is reasonable, identify what could make it wrong, and communicate uncertainty transparently.
        """
        response = openai_llm.invoke([
            SystemMessage(content="You are a financial market analysis agent. Return only the JSON object requested in the user message. Do not invent prices, news, or indicator values."),
            HumanMessage(content=final_prompt)
        ])
        answer = response.content
        if not isinstance(answer, str):
            answer = str(answer)
    except Exception as exc:
        answer = f"Final summary could not be generated. Reason: {exc}"
    return {
        'analysis_results':answer,
        'messages':[
            AIMessage(content=answer)
        ],
        'llm_calls':state.get('llm_calls',0) + 1
    }