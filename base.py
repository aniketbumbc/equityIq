
from typing import TypedDict,Annotated
import operator
from langchain_core.messages import AnyMessage
from pydantic import BaseModel
class EquityIQState(TypedDict):
    messages:Annotated[list[AnyMessage],operator.add] #reducer object to append messages to the list
    user_query:str #user query
    analysis_results:str #analysis results
    llm_calls:int #number of LLM calls
    historical_data:str #historical data
    company_news:str #company news
    market_sentiment:str #market sentiment
    technical_indicator:str #technical indicator



