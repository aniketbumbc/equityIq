from langgraph.graph import END, START, StateGraph

from agents.analyasis_agent import analyasis_agent
from agents.company_name_agent import company_name_agent
from agents.company_news_agent import company_news_agent
from agents.historic_data_agent import historic_data_agent
from agents.market_sentiment_agent import market_sentiment_agent
from agents.technical_indicator_agent import technical_indicator_agent
from base import EquityIQState

builder = StateGraph(EquityIQState)

builder.add_node("company_name_agent", company_name_agent)
builder.add_node("historic_data_agent", historic_data_agent)
builder.add_node("company_news_agent", company_news_agent)
builder.add_node("market_sentiment_agent", market_sentiment_agent)
builder.add_node("technical_indicator_agent", technical_indicator_agent)
builder.add_node("analyasis_agent", analyasis_agent)

builder.add_edge(START, "company_name_agent")
builder.add_edge("company_name_agent", "historic_data_agent")
builder.add_edge("historic_data_agent", "company_news_agent")
builder.add_edge("company_news_agent", "market_sentiment_agent")
builder.add_edge("market_sentiment_agent", "technical_indicator_agent")
builder.add_edge("technical_indicator_agent", "analyasis_agent")
builder.add_edge("analyasis_agent", END)

graph = builder.compile()
