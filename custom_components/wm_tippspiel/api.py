"""API-Football Client für automatische Ergebnisse."""

from __future__ import annotations

import logging
from typing import Any

import aiohttp
from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import (
    API_FOOTBALL_BASE_URL,
    API_FOOTBALL_LEAGUE,
    API_FOOTBALL_SEASON,
)

_LOGGER = logging.getLogger(__name__)

FINISHED_STATUSES = frozenset({"FT", "AET", "PEN"})


class ApiFootballError(Exception):
    """API-Football Fehler."""


class ApiFootballClient:
    """Minimaler Client für api-sports.io (API-Football)."""

    def __init__(self, hass, api_key: str) -> None:
        self._session = async_get_clientsession(hass)
        self._api_key = api_key.strip()

    async def async_get_fixtures(self) -> list[dict[str, Any]]:
        if not self._api_key:
            return []
        url = f"{API_FOOTBALL_BASE_URL}/fixtures"
        params = {
            "league": str(API_FOOTBALL_LEAGUE),
            "season": str(API_FOOTBALL_SEASON),
        }
        headers = {
            "x-apisports-key": self._api_key,
            "Accept": "application/json",
        }
        try:
            async with self._session.get(
                url, params=params, headers=headers, timeout=aiohttp.ClientTimeout(total=30)
            ) as response:
                body = await response.json(content_type=None)
                if response.status == 401:
                    raise ApiFootballError("Ungültiger API-Schlüssel")
                if response.status == 429:
                    raise ApiFootballError("API-Limit erreicht – später erneut versuchen")
                if response.status >= 400:
                    errors = body.get("errors") if isinstance(body, dict) else body
                    raise ApiFootballError(f"API-Fehler {response.status}: {errors}")
        except aiohttp.ClientError as err:
            raise ApiFootballError(f"Verbindungsfehler: {err}") from err

        if not isinstance(body, dict):
            raise ApiFootballError("Ungültige API-Antwort")
        errors = body.get("errors")
        if errors:
            if isinstance(errors, dict) and errors:
                raise ApiFootballError(str(errors))
            if isinstance(errors, list) and errors:
                raise ApiFootballError(str(errors[0]))

        response_list = body.get("response")
        if not isinstance(response_list, list):
            return []
        return response_list

    @staticmethod
    def parse_finished_results(
        fixtures: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        """Extrahiert beendete Spiele mit Toren."""
        results: list[dict[str, Any]] = []
        for item in fixtures:
            if not isinstance(item, dict):
                continue
            fixture = item.get("fixture") or {}
            status = (fixture.get("status") or {}).get("short")
            if status not in FINISHED_STATUSES:
                continue
            teams = item.get("teams") or {}
            goals = item.get("goals") or {}
            home_goals = goals.get("home")
            away_goals = goals.get("away")
            if home_goals is None or away_goals is None:
                continue
            home_team = teams.get("home") or {}
            away_team = teams.get("away") or {}
            results.append(
                {
                    "home_id": home_team.get("id"),
                    "away_id": away_team.get("id"),
                    "home_goals": int(home_goals),
                    "away_goals": int(away_goals),
                    "kickoff": fixture.get("date"),
                    "status": status,
                }
            )
        return results
