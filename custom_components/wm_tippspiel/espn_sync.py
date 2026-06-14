"""Synchronisiert WM-Ergebnisse aus der ESPN Scoreboard-API (wie Strato/EspnSync.php)."""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any

from aiohttp import ClientError

from homeassistant.helpers.aiohttp_client import async_get_clientsession

from .const import ESPN_SCOREBOARD_DATES, ESPN_SCOREBOARD_URL
from .teams import ESPN_NAME_ALIASES, EN_TO_DE

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

    from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)

_PLACEHOLDER = re.compile(r"^(\d+\.\s*Gruppe|3\.\s*Gruppe|Sieger|Verlierer)", re.IGNORECASE)


class EspnError(Exception):
    """ESPN Datenfehler."""


def _parse_utc_ts(value: str) -> int:
    cleaned = value.strip()
    if cleaned.endswith("Z"):
        dt = datetime.fromisoformat(cleaned.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp())


def _to_german_team(display_name: str) -> str | None:
    cleaned = display_name.strip()
    if not cleaned:
        return None
    canonical = ESPN_NAME_ALIASES.get(cleaned, cleaned)
    return EN_TO_DE.get(canonical)


def _team_pair_key(home: str, away: str) -> str:
    return f"{home}|{away}"


def _is_placeholder(name: str) -> bool:
    return bool(_PLACEHOLDER.match(name.strip()))


def _build_knockout_team_index(matches: list[dict[str, Any]]) -> dict[str, str]:
    index: dict[str, str] = {}
    for match in matches:
        if match.get("group"):
            continue
        home = str(match.get("home") or "")
        away = str(match.get("away") or "")
        if _is_placeholder(home) or _is_placeholder(away):
            continue
        match_id = str(match.get("id") or "")
        if match_id:
            index[_team_pair_key(home, away)] = match_id
    return index


def _find_unique_team_pair(
    matches: list[dict[str, Any]], home: str, away: str
) -> str | None:
    ids = [
        str(m["id"])
        for m in matches
        if m.get("home") == home and m.get("away") == away and m.get("id")
    ]
    return ids[0] if len(ids) == 1 else None


def _resolve_local_match_id(
    item: dict[str, Any],
    local_matches: list[dict[str, Any]],
    ko_by_teams: dict[str, str],
) -> str | None:
    home = _to_german_team(str(item.get("home_en", "")))
    away = _to_german_team(str(item.get("away_en", "")))
    if not home or not away:
        return None

    kickoff = int(item["kickoff"])
    kickoff_day = datetime.fromtimestamp(kickoff, tz=timezone.utc).strftime("%Y-%m-%d")

    for match in local_matches:
        if match.get("home") != home or match.get("away") != away:
            continue
        local_kickoff = _parse_utc_ts(str(match.get("kickoff") or "1970-01-01T00:00:00Z"))
        if abs(local_kickoff - kickoff) <= 60:
            return str(match.get("id") or "") or None

    for match in local_matches:
        if match.get("home") != home or match.get("away") != away:
            continue
        local_day = datetime.fromtimestamp(
            _parse_utc_ts(str(match.get("kickoff") or "1970-01-01T00:00:00Z")),
            tz=timezone.utc,
        ).strftime("%Y-%m-%d")
        if local_day == kickoff_day:
            return str(match.get("id") or "") or None

    unique = _find_unique_team_pair(local_matches, home, away)
    if unique:
        return unique

    return ko_by_teams.get(_team_pair_key(home, away))


def _parse_finished_event(event: dict[str, Any]) -> dict[str, Any] | None:
    competitions = event.get("competitions")
    if not isinstance(competitions, list) or not competitions:
        return None
    comp = competitions[0]
    if not isinstance(comp, dict):
        return None

    status = comp.get("status", {}).get("type", {})
    if (
        not isinstance(status, dict)
        or status.get("state") != "post"
        or not status.get("completed")
    ):
        return None

    home_name = away_name = None
    home_score = away_score = None
    competitors = comp.get("competitors")
    if not isinstance(competitors, list):
        return None

    for competitor in competitors:
        if not isinstance(competitor, dict):
            continue
        display_name = str(competitor.get("team", {}).get("displayName", ""))
        score_raw = competitor.get("score")
        side = competitor.get("homeAway")
        score = None if score_raw in (None, "") else int(score_raw)
        if side == "home":
            home_name = display_name
            home_score = score
        elif side == "away":
            away_name = display_name
            away_score = score

    if (
        home_name is None
        or away_name is None
        or home_score is None
        or away_score is None
    ):
        return None

    date_raw = comp.get("date") or event.get("date")
    if not isinstance(date_raw, str) or not date_raw.strip():
        return None

    return {
        "kickoff": _parse_utc_ts(date_raw),
        "home_en": home_name,
        "away_en": away_name,
        "home_goals": home_score,
        "away_goals": away_score,
    }


def _scoreboard_url() -> str:
    base = ESPN_SCOREBOARD_URL.strip()
    if not base:
        raise EspnError("Keine ESPN-Scoreboard-URL konfiguriert")
    dates = ESPN_SCOREBOARD_DATES.strip()
    if not dates:
        return base
    sep = "&" if "?" in base else "?"
    return f"{base}{sep}dates={dates}"


async def async_fetch_espn_finished(hass: HomeAssistant) -> list[dict[str, Any]]:
    """Lädt abgeschlossene Spiele aus der ESPN Scoreboard-API."""
    url = _scoreboard_url()
    session = async_get_clientsession(hass)
    headers = {"User-Agent": "homeassistant-wm-tippspiel/1.0 (results-sync)"}
    try:
        async with session.get(url, headers=headers, timeout=30) as response:
            response.raise_for_status()
            payload = await response.json()
    except (ClientError, TimeoutError) as err:
        raise EspnError(f"ESPN-Download fehlgeschlagen: {err}") from err

    if not isinstance(payload, dict):
        raise EspnError("Ungültige ESPN-JSON-Struktur")

    events = payload.get("events")
    if not isinstance(events, list):
        raise EspnError("Feld 'events' fehlt in der ESPN-Antwort")

    finished: list[dict[str, Any]] = []
    for event in events:
        if not isinstance(event, dict):
            continue
        parsed = _parse_finished_event(event)
        if parsed is not None:
            finished.append(parsed)
    return finished


def sync_from_espn(store: WmTippspielStore, remote_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Trägt passende Gruppen- und K.o.-Ergebnisse in den Store ein."""
    result: dict[str, Any] = {
        "updated_matches": 0,
        "updated_group": 0,
        "updated_knockout": 0,
        "finished_count": 0,
        "matched_count": 0,
        "skipped_unchanged": 0,
        "unmapped_count": 0,
        "error": None,
    }

    local_matches = store.get_matches()
    if not local_matches:
        result["error"] = "Keine lokalen Spiele geladen"
        return result

    store._refresh_knockout_teams()
    resolved_matches = store.get_matches()
    ko_by_teams = _build_knockout_team_index(resolved_matches)

    updated = 0
    updated_group = 0
    updated_knockout = 0
    matched = 0
    skipped_unchanged = 0
    unmapped = 0

    for item in remote_items:
        result["finished_count"] += 1
        match_id = _resolve_local_match_id(item, local_matches, ko_by_teams)
        if not match_id:
            unmapped += 1
            continue

        matched += 1
        home_goals = int(item["home_goals"])
        away_goals = int(item["away_goals"])
        existing = store.get_result(match_id)
        if existing and existing["home"] == home_goals and existing["away"] == away_goals:
            skipped_unchanged += 1
            continue

        is_knockout = False
        for match in local_matches:
            if str(match.get("id")) == match_id:
                is_knockout = not bool(match.get("group"))
                break
        store.set_result(match_id, home_goals, away_goals)
        updated += 1
        if is_knockout:
            updated_knockout += 1
        else:
            updated_group += 1
        _LOGGER.info(
            "espn: Ergebnis eingetragen %s = %s:%s",
            match_id,
            home_goals,
            away_goals,
        )
        store._refresh_knockout_teams()
        resolved_matches = store.get_matches()
        ko_by_teams = _build_knockout_team_index(resolved_matches)

    result["updated_matches"] = updated
    result["updated_group"] = updated_group
    result["updated_knockout"] = updated_knockout
    result["matched_count"] = matched
    result["skipped_unchanged"] = skipped_unchanged
    result["unmapped_count"] = unmapped
    return result
