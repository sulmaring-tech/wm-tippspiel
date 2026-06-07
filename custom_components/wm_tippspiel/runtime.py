"""Runtime-Daten pro Config Entry."""

from __future__ import annotations

from dataclasses import dataclass

from homeassistant.config_entries import ConfigEntry

from .coordinator import WmTippspielCoordinator
from .storage import WmTippspielStore


@dataclass
class WmTippspielRuntime:
    store: WmTippspielStore
    coordinator: WmTippspielCoordinator


def get_runtime(hass, entry_id: str) -> WmTippspielRuntime:
    from .const import DOMAIN

    runtime = hass.data.get(DOMAIN, {}).get(entry_id)
    if runtime is None:
        raise ValueError(f"WM Tippspiel nicht geladen: {entry_id}")
    return runtime


def get_store(hass, entry_id: str | None = None) -> WmTippspielStore:
    from .const import DOMAIN

    if not entry_id:
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            raise ValueError("Keine WM-Tippspiel-Integration konfiguriert")
        entry_id = entries[0].entry_id
    return get_runtime(hass, entry_id).store
