# Runs one question through the whole graph from the command line, without the API or the website.
# It calls the real OpenAI, Twelve Data, Tavily, and Alpha Vantage APIs, so it spends credits.
#
#   python smoke_run.py "Should I buy Starbucks stock?"

import sys
from uuid import uuid4

from langgraph.types import Command

from graph import graph

query = sys.argv[1] if len(sys.argv) > 1 else "Should I buy Starbucks stock?"
# The graph keeps runs in a checkpointer, so every run needs its own thread_id.
config = {"configurable": {"thread_id": str(uuid4())}}

result = graph.invoke(
    {"user_query": query, "requested_agents": [], "llm_calls": 0, "messages": []},
    config,
)

if result.get("stop_reason"):
    print("stopped:", result["stop_reason"])
    sys.exit(1)

print("symbol:", result.get("symbol"))
print("draft analysis:", result.get("analysis_results"))

# The run pauses at the human review step. Approve the draft so it writes the final report.
if graph.get_state(config).interrupts:
    result = graph.invoke(Command(resume={"approved": True, "feedback": ""}), config)

print("final report:", result.get("final_response"))
