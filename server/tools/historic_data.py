"""Fetch historical OHLCV bars from the Twelve Data time series API."""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

TIME_SERIES_URL = "https://api.twelvedata.com/time_series"
INTERVAL = "1day"


class HistoricDataError(Exception):
    def __init__(self, message: str, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def _date_range(years: int) -> tuple[str, str]:
    """Return start and end dates covering the past `years` years, ending today."""
    end_date = date.today()
    try:
        start_date = end_date.replace(year=end_date.year - years)
    except ValueError:
        start_date = end_date.replace(year=end_date.year - years, day=28)
    return start_date.isoformat(), end_date.isoformat()


def get_historic_data(symbol: str, years: int = 1, interval: str = INTERVAL) -> dict[str, Any]:
    """Return `years` years of bars at `interval` (1day, 1week, or 1month) ending today."""
    api_key = (os.getenv("TWELVEDATA_API_KEY") or "").strip()
    if not api_key:
        raise HistoricDataError("TWELVEDATA_API_KEY is not set", status_code=500)

    symbol = symbol.strip()
    if not symbol:
        raise HistoricDataError("symbol is required", status_code=400)

    start_date, end_date = _date_range(years)
    params: dict[str, Any] = {
        "symbol": symbol,
        "interval": interval,
        "start_date": start_date,
        "end_date": end_date,
        "apikey": api_key,
    }

    try:
        response = requests.get(TIME_SERIES_URL, params=params, timeout=30)
    except requests.RequestException as exc:
        raise HistoricDataError(f"Twelve Data request failed: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise HistoricDataError("Twelve Data returned a non-JSON response") from exc

    if response.status_code >= 400 or payload.get("status") == "error":
        message = payload.get("message") or "Twelve Data request failed"
        status_code = response.status_code if response.status_code >= 400 else 502
        raise HistoricDataError(str(message), status_code=status_code)

    return payload
