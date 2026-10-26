"""Fetch RSI, MACD, and ATR and return all three together."""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

ALPHA_VANTAGE_URL = "https://www.alphavantage.co/query"
MACD_URL = "https://api.twelvedata.com/macd"
ATR_URL = "https://api.twelvedata.com/atr"

RSI_INTERVAL = "monthly"
RSI_TIME_PERIOD = 10
RSI_SERIES_TYPE = "open"
MACD_INTERVAL = "1month"
ATR_INTERVAL = "1day"
ATR_TIME_PERIOD = 14


def _fetch(url: str, params: dict[str, Any]) -> dict[str, Any]:
    try:
        response = requests.get(url, params=params, timeout=30)
    except requests.RequestException as exc:
        return {"error": f"request failed: {exc}"}

    try:
        payload = response.json()
    except ValueError:
        return {"error": "non-JSON response"}

    if not isinstance(payload, dict):
        return {"error": "unexpected response"}

    if response.status_code >= 400 or payload.get("status") == "error":
        message = payload.get("message") or payload.get("Error Message") or "request failed"
        return {"error": str(message)}

    for key in ("Error Message", "Note", "Information"):
        if payload.get(key):
            return {"error": str(payload[key])}

    return payload


def _safe_result(future, name: str) -> dict[str, Any]:
    try:
        return future.result()
    except Exception as exc:
        return {"error": f"{name} failed: {exc}"}


def get_technical_indicators(symbol: str) -> dict[str, Any]:
    """Return RSI, MACD, and ATR for a ticker.

    A failed indicator is returned as {"error": "..."} so the other two
    are still included.
    """
    symbol = symbol.strip()
    if not symbol:
        error = {"error": "symbol is required"}
        return {"symbol": symbol, "rsi": error, "macd": error, "atr": error}

    twelve_key = (os.getenv("TWELVEDATA_API_KEY") or "").strip()
    alpha_key = (os.getenv("ALPHAVANTAGE_API_KEY") or "").strip()
    missing_twelve = {"error": "TWELVEDATA_API_KEY is not set"}
    missing_alpha = {"error": "ALPHAVANTAGE_API_KEY is not set"}

    with ThreadPoolExecutor(max_workers=3) as pool:
        if alpha_key:
            rsi = pool.submit(
                _fetch,
                ALPHA_VANTAGE_URL,
                {
                    "function": "RSI",
                    "symbol": symbol,
                    "interval": RSI_INTERVAL,
                    "time_period": RSI_TIME_PERIOD,
                    "series_type": RSI_SERIES_TYPE,
                    "apikey": alpha_key,
                },
            )
        else:
            rsi = None
        if twelve_key:
            macd = pool.submit(
                _fetch,
                MACD_URL,
                {
                    "symbol": symbol,
                    "interval": MACD_INTERVAL,
                    "apikey": twelve_key,
                },
            )
            atr = pool.submit(
                _fetch,
                ATR_URL,
                {
                    "symbol": symbol,
                    "interval": ATR_INTERVAL,
                    "time_period": ATR_TIME_PERIOD,
                    "apikey": twelve_key,
                },
            )
        else:
            macd = None
            atr = None

        return {
            "symbol": symbol,
            "rsi": _safe_result(rsi, "RSI") if rsi else missing_alpha,
            "macd": _safe_result(macd, "MACD") if macd else missing_twelve,
            "atr": _safe_result(atr, "ATR") if atr else missing_twelve,
        }
