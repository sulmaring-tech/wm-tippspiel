"""Sensor-Plattform für WM Tippspiel."""

from __future__ import annotations

from typing import Any

from homeassistant.components.sensor import SensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers import entity_registry as er
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import (
    ATTR_MATCHES,
    ATTR_PLAYERS,
    ATTR_RESULTS,
    ATTR_STANDINGS,
    DOMAIN,
)
from .coordinator import WmTippspielCoordinator
from .runtime import get_runtime
from .storage import WmTippspielStore


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    runtime = get_runtime(hass, entry.entry_id)
    registry_key = f"{DOMAIN}_{entry.entry_id}_add_entities"
    hass.data.setdefault(DOMAIN, {})[registry_key] = async_add_entities

    entities: list[SensorEntity] = [
        WmTippspielLeaderboardSensor(entry, runtime.store, runtime.coordinator),
    ]
    entities.extend(_player_entities(entry, runtime.store))
    async_add_entities(entities)


def _player_entities(
    entry: ConfigEntry, store: WmTippspielStore
) -> list[WmTippspielPlayerSensor]:
    return [WmTippspielPlayerSensor(entry, store, player) for player in store.get_players()]


async def async_add_player_entities(
    hass: HomeAssistant, entry_id: str, store: WmTippspielStore, player: dict[str, str]
) -> None:
    """Registriert einen neuen Spieler-Sensor nach add_player."""
    registry_key = f"{DOMAIN}_{entry_id}_add_entities"
    async_add_entities = hass.data.get(DOMAIN, {}).get(registry_key)
    if async_add_entities is None:
        return
    entries = hass.config_entries.async_entries(DOMAIN)
    entry = next((e for e in entries if e.entry_id == entry_id), None)
    if entry is None:
        return
    async_add_entities([WmTippspielPlayerSensor(entry, store, player)])


class WmTippspielBaseSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_icon = "mdi:soccer"

    def __init__(self, entry: ConfigEntry, store: WmTippspielStore) -> None:
        self._entry = entry
        self._store = store
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "WM Tippspiel",
        }

    async def async_added_to_hass(self) -> None:
        @callback
        def _handle_update(_event) -> None:
            self.async_write_ha_state()

        self.async_on_remove(
            self.hass.bus.async_listen(f"{DOMAIN}_updated", _handle_update)
        )


class WmTippspielLeaderboardSensor(WmTippspielBaseSensor):
    _attr_name = "Rangliste"
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_unique_id = None

    def __init__(
        self,
        entry: ConfigEntry,
        store: WmTippspielStore,
        coordinator: WmTippspielCoordinator,
    ) -> None:
        super().__init__(entry, store)
        self._coordinator = coordinator

    @property
    def unique_id(self) -> str:
        return f"{self._entry.entry_id}_leaderboard"

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        self.async_on_remove(
            self._coordinator.async_add_listener(self.async_write_ha_state)
        )

    @property
    def native_value(self) -> str:
        standings = self._store.compute_standings()
        if not standings:
            return "0 Spieler"
        leader = standings[0]
        return f"{leader['name']} ({leader['points']} Pkt.)"

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        attrs: dict[str, Any] = {
            "entry_id": self._entry.entry_id,
            ATTR_STANDINGS: self._store.compute_standings(),
            ATTR_PLAYERS: self._store.get_players(),
            ATTR_MATCHES: self._store.get_matches_for_card(),
            ATTR_RESULTS: self._store.data.get("results", {}),
            "group_tables": self._store.get_group_tables(),
            "player_entities": self._player_entities(),
        }
        if self._coordinator.data:
            attrs["api_sync"] = {
                "enabled": self._coordinator.data.get("api_enabled"),
                "last_sync": self._coordinator.data.get("last_sync"),
                "updated_matches": self._coordinator.data.get("updated_matches"),
                "schedule_updates": self._coordinator.data.get("schedule_updates"),
                "finished_count": self._coordinator.data.get("finished_count"),
                "error": self._coordinator.data.get("error"),
            }
        return attrs

    def _player_entities(self) -> dict[str, str]:
        registry = er.async_get(self.hass)
        mapping: dict[str, str] = {}
        for player in self._store.get_players():
            player_id = player.get("id")
            if not player_id:
                continue
            unique_id = f"{self._entry.entry_id}_player_{player_id}"
            entity_id = registry.async_get_entity_id("sensor", DOMAIN, unique_id)
            if entity_id:
                mapping[str(player_id)] = entity_id
        return mapping


class WmTippspielPlayerSensor(WmTippspielBaseSensor):
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(
        self, entry: ConfigEntry, store: WmTippspielStore, player: dict[str, str]
    ) -> None:
        super().__init__(entry, store)
        self._player = player
        self._attr_name = player["name"]
        self._attr_unique_id = f"{entry.entry_id}_player_{player['id']}"

    @property
    def native_value(self) -> int:
        return self._store.player_points(self._player["id"])

    @property
    def native_unit_of_measurement(self) -> str:
        return "Pkt."

    @property
    def extra_state_attributes(self) -> dict[str, Any]:
        tips = self._store.data.get("tips", {}).get(self._player["id"], {})
        standings = {
            row["id"]: row for row in self._store.compute_standings()
        }.get(self._player["id"], {})
        return {
            "player_id": self._player["id"],
            "tips": tips,
            "exact": standings.get("exact", 0),
            "tendency": standings.get("tendency", 0),
            "tipped": standings.get("tipped", 0),
            "rank": standings.get("rank"),
        }
