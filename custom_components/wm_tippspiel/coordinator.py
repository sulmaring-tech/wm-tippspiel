"""Coordinator: synchronisiert WM-Ergebnisse aus openfootball."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator

from .const import CONF_AUTO_RESULTS, CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL, DOMAIN
from .openfootball_sync import OpenFootballError, async_fetch_openfootball_matches, sync_from_openfootball
from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)


class WmTippspielCoordinator(DataUpdateCoordinator[dict[str, Any]]):
    """Pollt openfootball für Gruppenspiel-Ergebnisse."""

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
            "updated_matches": 0,
            "finished_count": 0,
            "error": None,
        }
        if not self._auto_enabled():
            return result

        try:
            remote_matches = await async_fetch_openfootball_matches(self.hass)
            of_result = await self.hass.async_add_executor_job(
                sync_from_openfootball, self.store, remote_matches
            )
            result["updated_matches"] = of_result.get("updated_matches", 0)
            result["finished_count"] = of_result.get("finished_count", 0)
            if of_result.get("updated_matches"):
                await self.store.async_save()
                self.hass.bus.async_fire(f"{DOMAIN}_updated")
        except OpenFootballError as err:
            result["error"] = str(err)
            _LOGGER.warning("openfootball: %s", err)

        return result
