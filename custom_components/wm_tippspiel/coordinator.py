"""Coordinator: synchronisiert WM-Ergebnisse (ESPN wie Strato, openfootball Fallback)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import CONF_AUTO_RESULTS, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN
from .espn_sync import EspnError, async_fetch_espn_finished, sync_from_espn
from .openfootball_sync import OpenFootballError, async_fetch_openfootball_matches, sync_from_openfootball
from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)


class WmTippspielCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Pollt ESPN (primär) und openfootball (Fallback) für Ergebnisse."""

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

    def _auto_enabled(self) -> bool:
        return bool(self.entry.options.get(CONF_AUTO_RESULTS, True))

    async def _async_update_data(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "last_sync": datetime.now().isoformat(),
            "sync_enabled": self._auto_enabled(),
            "source": "espn",
            "updated_matches": 0,
            "updated_group": 0,
            "updated_knockout": 0,
            "finished_count": 0,
            "matched_count": 0,
            "skipped_unchanged": 0,
            "unmapped_count": 0,
            "error": None,
        }
        if not self._auto_enabled():
            return result

        updated = False
        try:
            remote_items = await async_fetch_espn_finished(self.hass)
            espn_result = await self.hass.async_add_executor_job(
                sync_from_espn, self.store, remote_items
            )
            result.update(
                {
                    "source": "espn",
                    "updated_matches": espn_result.get("updated_matches", 0),
                    "updated_group": espn_result.get("updated_group", 0),
                    "updated_knockout": espn_result.get("updated_knockout", 0),
                    "finished_count": espn_result.get("finished_count", 0),
                    "matched_count": espn_result.get("matched_count", 0),
                    "skipped_unchanged": espn_result.get("skipped_unchanged", 0),
                    "unmapped_count": espn_result.get("unmapped_count", 0),
                    "error": espn_result.get("error"),
                }
            )
            updated = bool(espn_result.get("updated_matches"))
        except EspnError as err:
            _LOGGER.warning("espn: %s – Fallback openfootball", err)
            result["error"] = str(err)
            try:
                remote_matches = await async_fetch_openfootball_matches(self.hass)
                of_result = await self.hass.async_add_executor_job(
                    sync_from_openfootball, self.store, remote_matches
                )
                result.update(
                    {
                        "source": "openfootball",
                        "updated_matches": of_result.get("updated_matches", 0),
                        "updated_group": of_result.get("updated_matches", 0),
                        "finished_count": of_result.get("finished_count", 0),
                        "error": None,
                    }
                )
                updated = bool(of_result.get("updated_matches"))
            except OpenFootballError as of_err:
                result["error"] = f"ESPN: {err}; openfootball: {of_err}"
                _LOGGER.warning("openfootball: %s", of_err)

        if updated:
            await self.store.async_save()
            self.hass.bus.async_fire(f"{DOMAIN}_updated")

        return result
