"""Look up a company name, then return one year of its daily price history."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

from tools.historic_data import get_historic_data

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

SYMBOL_SEARCH_URL = "https://api.twelvedata.com/symbol_search"


class SymbolLookupError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def lookup_symbol(company_name: str) -> str:
    """Return the ticker for a company name, for example Apple -> AAPL."""
    api_key = (os.getenv("TWELVEDATA_API_KEY") or "").strip()
    if not api_key:
        raise SymbolLookupError("TWELVEDATA_API_KEY is not set", status_code=500)

    company_name = company_name.strip()
    if not company_name:
        raise SymbolLookupError("company name is required", status_code=400)

    params: dict[str, Any] = {
        "symbol": company_name,
        "apikey": api_key,
    }

    try:
        response = requests.get(SYMBOL_SEARCH_URL, params=params, timeout=30)
    except requests.RequestException as exc:
        raise SymbolLookupError(f"Twelve Data request failed: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise SymbolLookupError("Twelve Data returned a non-JSON response") from exc

    if response.status_code >= 400 or payload.get("status") == "error":
        message = payload.get("message") or "Twelve Data request failed"
        status_code = response.status_code if response.status_code >= 400 else 502
        raise SymbolLookupError(str(message), status_code=status_code)

    matches = payload.get("data") or []
    if not matches:
        raise SymbolLookupError(f"No symbol found for {company_name}", status_code=404)

    symbol = (matches[0].get("symbol") or "").strip()
    if not symbol:
        raise SymbolLookupError(f"No symbol found for {company_name}", status_code=404)

    return symbol


def get_symbol(company_name: str) -> dict[str, Any]:
    """Look up a company name and return one year of its daily bars."""
    return get_historic_data(lookup_symbol(company_name))
