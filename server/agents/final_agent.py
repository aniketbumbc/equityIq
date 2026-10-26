from pathlib import Path
import os

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from base import EquityIQState

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

openai_llm = ChatOpenAI(api_key=os.getenv("OPENAI_API_KEY"), model="gpt-4o-mini")


def final_agent(state: EquityIQState) -> EquityIQState:
    """Revise the draft analysis and return the same JSON forecast shape."""
    llm_calls = state.get("llm_calls", 0) + 1
    review_instruction = (
        "The user has approved the draft analysis. Preserve its decision while polishing it."
    )
    revision_notes = [note for note in state.get("revision_notes", []) if note]
    if revision_notes:
        review_instruction += (
            " Before approving, the user asked for these revisions, which the draft already applies: "
            + "; ".join(revision_notes)
            + ". Summarize them in human_review.feedback_applied."
        )

    try:
        if not os.getenv("OPENAI_API_KEY"):
            raise ValueError("OPENAI_API_KEY is not set")
        final_prompt = (
            f"""
        You are a financial market analyst. Your task is to review the draft analysis and produce a final report.
        Human Review:{review_instruction}
        Draft analysis: {state.get("analysis_results","")}
        User Request: {state.get("user_query","")}
        supervisor constraints: {state.get("query_constraints",{})}
        historical data: {state.get("historical_data","")}
        company news: {state.get("company_news","")}
        market sentiment: {state.get("market_sentiment","")}
        technical indicator: {state.get("technical_indicator","")}
        draft analysis: {state.get("analysis_results","")}

        The final report should be in the following format:
        - Clear and concise summary of the analysis.
        - Highlight key findings and insights.
        - Provide a clear recommendation based on the analysis.
        - Include any necessary analysis and reasoning.

        Required Output Format
        Return only one JSON object with the same keys as the example. Do not add a prose report before or after the JSON.
        Use null when a number is not justified by the inputs. Include a price range only when the data supports it.
        If a supplied input is missing or is an error, set the matching data_quality flag to false and do not invent that value.

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
          "key_findings": [
            "State the strongest evidence from the draft and the human review"
          ],
          "recommendation": {{
            "stance": "insufficient evidence",
            "summary": "Clear recommendation based on the revised analysis.",
            "reasoning": "Why that recommendation follows from the evidence."
          }},
          "human_review": {{
            "approved": false,
            "feedback_applied": "",
            "changes_made": []
          }},
          "final_conclusion": "The outlook is cautiously bullish, but the forecast is uncertain.",
          "disclaimer": "Informational analysis only; not a guarantee of future performance."
        }}
            """
        )
        response = openai_llm.invoke([
            SystemMessage(content="You are a financial market analyst. Return only the JSON object requested in the user message. Do not invent prices, news, or indicator values."),
            HumanMessage(content=final_prompt),
        ])
        answer = response.content
        if not isinstance(answer, str):
            answer = str(answer)
    except Exception as exc:
        answer = f"Final summary could not be generated. Reason: {exc}"

    return {
        "final_response": answer,
        "messages": [AIMessage(content=answer)],
        "llm_calls": llm_calls,
    }
