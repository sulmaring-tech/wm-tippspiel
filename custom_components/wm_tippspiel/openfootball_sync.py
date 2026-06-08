"""Synchronisiert Gruppenspiel-Ergebnisse aus openfootball/worldcup.json."""

from __future__ import annotations

import logging
import re
from typing import TYPE_CHECKING, Any

from aiohttp import ClientError

from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import OPENFOOTBALL_JSON_URL
from .teams import OPENFOOTBALL_TEAM_NAMES

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

    from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)

_PLACEHOLDER_TEAM = re.compile(
    r"^[WL]?\d|^[12]\d?$|\/|Gruppe|Winner|Loser", re.IGNORECASE
)
_GROUP_RE = re.compile(r"Group\s+([A-L])", re.IGNORECASE)


class OpenFootballError(Exception):
    """openfootball Datenfehler."""


def _to_german_team(name: str) -> str | None:
    cleaned = name.strip()
    if not cleaned or _PLACEHOLDER_TEAM.search(cleaned):
        return None
    return OPENFOOTBALL_TEAM_NAMES.get(cleaned)


def _parse_group(group: str | None) -> str | None:
    if not group:
        return None
    match = _GROUP_RE.search(group)
    return match.group(1).upper() if match else None


def _parse_score(item: dict[str, Any]) -> tuple[int, int] | None:
    score = item.get("score")
    if not isinstance(score, dict):
        return None
    ft = score.get("ft")
    if not isinstance(ft, list) or len(ft) != 2:
        return None
    try:
        return int(ft[0]), int(ft[1])
    except (TypeError, ValueError):
        return None


def _find_local_match_id(
    matches: list[dict[str, Any]],
    group: str,
    home: str,
    away: str,
) -> str | None:
    for match in matches:
        if str(match.get("group", "")).upper() != group:
            continue
        if match.get("home") == home and match.get("away") == away:
            return str(match["id"])
    return None


async def async_fetch_openfootball_matches(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Lädt die openfootball WM-2026 JSON."""
    url = OPENFOOTBALL_JSON_URL.strip()
    if not url:
        raise OpenFootballError("Keine openfootball-URL konfiguriert")

    session = async_get_clientsession(hass)
    try:
        async with session.get(url, timeout=30) as response:
            response.raise_for_status()
            payload = await response.json()
    except (ClientError, TimeoutError) as err:
        raise OpenFootballError(f"Download fehlgeschlagen: {err}") from err

    if not isinstance(payload, dict):
        raise OpenFootballError("Ungültige JSON-Struktur")

    matches = payload.get("matches")
    if not isinstance(matches, list):
        raise OpenFootballError("Feld 'matches' fehlt in der JSON-Datei")
    return matches


def sync_from_openfootball(store: WmTippspielStore, remote_matches: list[dict[str, Any]]) -> dict[str, Any]:
    """Trägt passende Gruppenspiel-Ergebnisse in den Store ein."""
    result: dict[str, Any] = {
        "updated_matches": 0,
        "finished_count": 0,
        "error": None,
    }

    local_matches = store.get_matches()
    updated = 0
    finished = 0

    for item in remote_matches:
        if not isinstance(item, dict):
            continue
        goals = _parse_score(item)
        if goals is None:
            continue
        finished += 1

        group = _parse_group(item.get("group"))
        if not group:
            continue

        home = _to_german_team(str(item.get("team1", "")))
        away = _to_german_team(str(item.get("team2", "")))
        if not home or not away:
            continue

        match_id = _find_local_match_id(local_matches, group, home, away)
        if not match_id:
            continue

        home_goals, away_goals = goals
        existing = store.get_result(match_id)
        if existing and existing["home"] == home_goals and existing["away"] == away_goals:
            continue

        store.set_result(match_id, home_goals, away_goals)
        updated += 1
        _LOGGER.info(
            "openfootball: Ergebnis eingetragen %s = %s:%s",
            match_id,
            home_goals,
            away_goals,
        )

    result["updated_matches"] = updated
    result["finished_count"] = finished
    return result
