from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph

from agents.analyasis_agent import analyasis_agent
from agents.company_name_agent import company_name_agent
from agents.company_news_agent import company_news_agent
from agents.historic_data_agent import historic_data_agent
from agents.market_sentiment_agent import market_sentiment_agent
from agents.technical_indicator_agent import technical_indicator_agent
from agents.human_inloop_agent import human_inloop_agent as human_in_the_loop
from agents.final_agent import final_agent as final_response_agent
from base import EquityIQState
from routing import route_after_agent, route_from_human, route_from_supervisor, ROUTE_MAP
from agents.guardrail_block_agent import guardrail_block_agent as guardrail_blocked
from agents.supervisor_agent import supervisor

builder = StateGraph(EquityIQState) #create graph

builder.add_node("supervisor", supervisor)
builder.add_node("guardrail_blocked", guardrail_blocked)
builder.add_node("company_name_agent", company_name_agent) #add node to graph
builder.add_node("historic_data_agent", historic_data_agent)
builder.add_node("company_news_agent", company_news_agent) #add node to graph
builder.add_node("market_sentiment_agent", market_sentiment_agent) #add node to graph
builder.add_node("technical_indicator_agent", technical_indicator_agent) #add node to graph
builder.add_node("analyasis_agent", analyasis_agent) #add node to graph
builder.add_node("human_in_the_loop", human_in_the_loop) #add node to graph
builder.add_node("final_response_agent", final_response_agent)






builder.add_edge(START, "supervisor") #add edge to graph
builder.add_conditional_edges("supervisor", route_from_supervisor,ROUTE_MAP)

builder.add_conditional_edges("company_name_agent", route_after_agent("company_name_agent"),ROUTE_MAP)
builder.add_conditional_edges("historic_data_agent", route_after_agent("historic_data_agent"),ROUTE_MAP)
builder.add_conditional_edges("company_news_agent", route_after_agent("company_news_agent"),ROUTE_MAP)
builder.add_conditional_edges("market_sentiment_agent", route_after_agent("market_sentiment_agent"),ROUTE_MAP)
builder.add_conditional_edges("technical_indicator_agent", route_after_agent("technical_indicator_agent"),ROUTE_MAP)
builder.add_conditional_edges("analyasis_agent", route_after_agent("analyasis_agent"),ROUTE_MAP)
builder.add_conditional_edges(
    "human_in_the_loop",
    route_from_human,
    ["final_response_agent", END],
)
builder.add_edge("guardrail_blocked", END)
builder.add_edge("final_response_agent", END)



graph = builder.compile(checkpointer=InMemorySaver())
