from tools.get_symbol import get_symbol
from tools.technical_indicator import get_technical_indicators
from graph import graph

result = graph.invoke({"user_query":"Should i buy starbucks stock?"})

print("symbol:", result.get("symbol"))
print("analysis:", result.get("analysis_results"))
