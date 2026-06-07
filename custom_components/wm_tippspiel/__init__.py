"""Home Assistant Integration für WM Tippspiel."""

from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, callback
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import (
    ATTR_AWAY,
    ATTR_HOME,
    ATTR_MATCH_ID,
    ATTR_NAME,
    ATTR_PLAYER_ID,
    CONF_PLAYERS,
    CONF_TITLE,
    DOMAIN,
    SERVICE_ADD_PLAYER,
    SERVICE_REMOVE_PLAYER,
    SERVICE_SET_RESULT,
    SERVICE_SET_TIP,
)
from .storage import WmTippspielStore

_LOGGER = logging.getLogger(__name__)

PLATFORMS: list[Platform] = [Platform.SENSOR, Platform.UPDATE]
_WWW_DIR = Path(__file__).parent / "www"

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Stellt die Lovelace-Karte bereit, sobald die Integration geladen ist."""
    await _register_www(hass)
    hass.data.setdefault(DOMAIN, {})
    return True


async def _register_www(hass: HomeAssistant) -> None:
    if hass.data.get(DOMAIN, {}).get("_www_registered"):
        return
    if not _WWW_DIR.is_dir():
        _LOGGER.error("WM Tippspiel: www-Ordner nicht gefunden (%s)", _WWW_DIR)
        return
    await hass.http.async_register_static_paths(
        [StaticPathConfig("/wm_tippspiel", str(_WWW_DIR), False)]
    )
    hass.data.setdefault(DOMAIN, {})["_www_registered"] = True
    _LOGGER.debug("WM Tippspiel: Karte unter /wm_tippspiel/ registriert")


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store = WmTippspielStore(hass, entry.entry_id)
    await store.async_load()

    for name in entry.data.get(CONF_PLAYERS, []):
        name = str(name).strip()
        if name and not any(p["name"].lower() == name.lower() for p in store.get_players()):
            store.add_player(name)
    await store.async_save()

    hass.data.setdefault(DOMAIN, {})[entry.entry_id] = store

    await _register_www(hass)
    _register_services(hass)

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    return True


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        hass.data.get(DOMAIN, {}).pop(entry.entry_id, None)
    return unload_ok


def _get_store(hass: HomeAssistant, entry_id: str | None) -> WmTippspielStore:
    if not entry_id:
        entries = hass.config_entries.async_entries(DOMAIN)
        if not entries:
            raise ValueError("Keine WM-Tippspiel-Integration konfiguriert")
        entry_id = entries[0].entry_id
    store = hass.data.get(DOMAIN, {}).get(entry_id)
    if store is None:
        raise ValueError(f"Unbekannte Konfiguration: {entry_id}")
    return store


def _register_services(hass: HomeAssistant) -> None:
    if hass.services.has_service(DOMAIN, SERVICE_SET_TIP):
        return

    async def _set_tip(call: ServiceCall) -> None:
        store = _get_store(hass, call.data.get("entry_id"))
        store.set_tip(
            call.data[ATTR_PLAYER_ID],
            call.data[ATTR_MATCH_ID],
            call.data[ATTR_HOME],
            call.data[ATTR_AWAY],
        )
        await store.async_save()
        _async_notify(hass)

    async def _set_result(call: ServiceCall) -> None:
        store = _get_store(hass, call.data.get("entry_id"))
        store.set_result(
            call.data[ATTR_MATCH_ID],
            call.data[ATTR_HOME],
            call.data[ATTR_AWAY],
        )
        await store.async_save()
        _async_notify(hass)

    async def _add_player(call: ServiceCall) -> None:
        entry_id = call.data.get("entry_id")
        if not entry_id:
            entries = hass.config_entries.async_entries(DOMAIN)
            entry_id = entries[0].entry_id if entries else None
        store = _get_store(hass, entry_id)
        player = store.add_player(call.data[ATTR_NAME])
        await store.async_save()
        from .sensor import async_add_player_entities

        await async_add_player_entities(hass, entry_id, store, player)
        _async_notify(hass)

    async def _remove_player(call: ServiceCall) -> None:
        store = _get_store(hass, call.data.get("entry_id"))
        if not store.remove_player(call.data[ATTR_PLAYER_ID]):
            raise ValueError(f"Spieler nicht gefunden: {call.data[ATTR_PLAYER_ID]}")
        await store.async_save()
        _async_notify(hass)

    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_TIP,
        _set_tip,
        schema=vol.Schema(
            {
                vol.Optional("entry_id"): cv.string,
                vol.Required(ATTR_PLAYER_ID): cv.string,
                vol.Required(ATTR_MATCH_ID): cv.string,
                vol.Required(ATTR_HOME): vol.All(vol.Coerce(int), vol.Range(min=0, max=20)),
                vol.Required(ATTR_AWAY): vol.All(vol.Coerce(int), vol.Range(min=0, max=20)),
            }
        ),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_SET_RESULT,
        _set_result,
        schema=vol.Schema(
            {
                vol.Optional("entry_id"): cv.string,
                vol.Required(ATTR_MATCH_ID): cv.string,
                vol.Required(ATTR_HOME): vol.All(vol.Coerce(int), vol.Range(min=0, max=20)),
                vol.Required(ATTR_AWAY): vol.All(vol.Coerce(int), vol.Range(min=0, max=20)),
            }
        ),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_ADD_PLAYER,
        _add_player,
        schema=vol.Schema(
            {
                vol.Optional("entry_id"): cv.string,
                vol.Required(ATTR_NAME): cv.string,
            }
        ),
    )
    hass.services.async_register(
        DOMAIN,
        SERVICE_REMOVE_PLAYER,
        _remove_player,
        schema=vol.Schema(
            {
                vol.Optional("entry_id"): cv.string,
                vol.Required(ATTR_PLAYER_ID): cv.string,
            }
        ),
    )


@callback
def _async_notify(hass: HomeAssistant) -> None:
    hass.bus.async_fire(f"{DOMAIN}_updated")
