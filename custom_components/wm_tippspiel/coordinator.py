"""Coordinator: synchronisiert WM-Ergebnisse von API-Football."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .api import ApiFootballClient, ApiFootballError
from .const import (
    CONF_API_KEY,
    CONF_AUTO_RESULTS,
    CONF_SCAN_INTERVAL,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
)
from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)

_TEAM_MAP_FILE = Path(__file__).parent / "data" / "team_api_ids.json"


def _load_team_map() -> dict[str, int]:
    if not _TEAM_MAP_FILE.is_file():
        return {}
    data = json.loads(_TEAM_MAP_FILE.read_text(encoding="utf-8"))
    return {str(k): int(v) for k, v in data.items()}


class WmTippspielCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Pollt API-Football und trägt Ergebnisse ein."""

    def __init__(
        self,
        hass: HomeAssistant,
        entry: ConfigEntry,
        store: WmTippspielStore,
    ) -> None:
        scan_interval = int(
            entry.options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL)
        )
        super().__init__(
            hass,
            _LOGGER,
            name=DOMAIN,
            update_interval=timedelta(seconds=scan_interval),
        )
        self.entry = entry
        self.store = store
        self._team_map = _load_team_map()
        self._team_to_name = {v: k for k, v in self._team_map.items()}

    def _api_key(self) -> str:
        return str(self.entry.options.get(CONF_API_KEY, "")).strip()

    def _auto_enabled(self) -> bool:
        return bool(self.entry.options.get(CONF_AUTO_RESULTS, True)) and bool(
            self._api_key()
        )

    async def _async_update_data(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "last_sync": datetime.now().isoformat(),
            "updated_matches": 0,
            "api_enabled": self._auto_enabled(),
            "error": None,
        }
        if not self._auto_enabled():
            return result

        client = ApiFootballClient(self.hass, self._api_key())
        try:
            fixtures = await client.async_get_fixtures()
            finished = ApiFootballClient.parse_finished_results(fixtures)
            updated = self._apply_results(finished)
            result["updated_matches"] = updated
            result["finished_count"] = len(finished)
            if updated:
                await self.store.async_save()
                self.hass.bus.async_fire(f"{DOMAIN}_updated")
        except ApiFootballError as err:
            result["error"] = str(err)
            _LOGGER.warning("API-Football: %s", err)
            return result

        return result

    def _apply_results(self, finished: list[dict[str, Any]]) -> int:
        updated = 0
        for item in finished:
            match_id = self._find_match_id(
                item.get("home_id"),
                item.get("away_id"),
                item.get("kickoff"),
            )
            if not match_id:
                continue
            home = int(item["home_goals"])
            away = int(item["away_goals"])
            existing = self.store.get_result(match_id)
            if existing and existing["home"] == home and existing["away"] == away:
                continue
            self.store.set_result(match_id, home, away)
            updated += 1
            _LOGGER.info(
                "Ergebnis automatisch eingetragen: %s = %s:%s",
                match_id,
                home,
                away,
            )
        return updated

    def _find_match_id(
        self,
        home_api_id: Any,
        away_api_id: Any,
        kickoff: str | None,
    ) -> str | None:
        if home_api_id is None or away_api_id is None:
            return None
        try:
            home_api_id = int(home_api_id)
            away_api_id = int(away_api_id)
        except (TypeError, ValueError):
            return None

        kickoff_dt = _parse_iso(kickoff)
        for match in self.store.get_matches():
            home_name = match.get("home")
            away_name = match.get("away")
            if not home_name or not away_name:
                continue
            mapped_home = self._team_map.get(home_name)
            mapped_away = self._team_map.get(away_name)
            if mapped_home != home_api_id or mapped_away != away_api_id:
                continue
            if kickoff_dt and match.get("kickoff"):
                match_dt = _parse_iso(str(match["kickoff"]))
                if match_dt and abs((match_dt - kickoff_dt).total_seconds()) > 36 * 3600:
                    continue
            return str(match["id"])
        return None


def _parse_iso(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
