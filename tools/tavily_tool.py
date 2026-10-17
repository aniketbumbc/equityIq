from pathlib import Path

from tavily import TavilyClient
from dotenv import load_dotenv
import os

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = TavilyClient(api_key=os.getenv("TAVILY_API_KEY"))
    return _client


def search_tavily(query: str) -> str:
    try:
        response = _get_client().search(query, max_results=3)
    except Exception as exc:
        return f"Search failed: {exc}"

    matches = response.get("results") if isinstance(response, dict) else None
    if not matches:
        return "No search results found"

    results = []
    for i, r in enumerate(matches, 1):
        title = r.get("title", "")
        url = r.get("url", "")
        description = r.get("description", "")
        snippet = (r.get("content") or "").strip()

        if len(snippet) > 300:
            snippet = snippet[:300].rsplit(" ", 1)[0] + "..."

        results.append(f"{i}. **{title}**   \n{description}\n{snippet}\n{url}")

    return "\n\n".join(results) if results else "No search results found"



