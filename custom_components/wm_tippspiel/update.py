"""Update-Plattform: erscheint im Home-Assistant-Update-Manager."""

from __future__ import annotations

import io
import logging
import shutil
import tempfile
import zipfile
from pathlib import Path
from typing import Any

from awesomeversion import AwesomeVersion
from homeassistant.components.update import (
    UpdateEntity,
    UpdateEntityFeature,
)
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.helpers.entity import EntityCategory
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.helpers.event import async_call_later
from homeassistant.helpers.issue_registry import IssueSeverity, async_create_issue

from .const import (
    DOMAIN,
    GITHUB_RELEASES_URL,
    GITHUB_USER_AGENT,
    integration_version,
)

_LOGGER = logging.getLogger(__name__)

UPDATE_INTERVAL_SECONDS = 6 * 60 * 60


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    async_add_entities([WmTippspielUpdateEntity(hass, entry)])


class WmTippspielUpdateEntity(UpdateEntity):
    """Software-Update für WM Tippspiel (GitHub Releases)."""

    _attr_entity_category = EntityCategory.CONFIG
    _attr_has_entity_name = True
    _attr_translation_key = "software_update"
    _attr_supported_features = (
        UpdateEntityFeature.INSTALL | UpdateEntityFeature.RELEASE_NOTES
    )

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self._hass = hass
        self._entry = entry
        self._attr_unique_id = f"{entry.entry_id}_update"
        self._attr_installed_version = integration_version()
        self._attr_device_info = {
            "identifiers": {(DOMAIN, entry.entry_id)},
            "name": entry.title,
            "manufacturer": "WM Tippspiel",
            "sw_version": self._attr_installed_version,
        }
        self._release_data: dict[str, Any] | None = None
        self._unsub_update: callback | None = None

    async def async_added_to_hass(self) -> None:
        await self.async_update()
        self._schedule_next_check()

    async def async_will_remove_from_hass(self) -> None:
        if self._unsub_update:
            self._unsub_update()
            self._unsub_update = None

    @callback
    def _schedule_next_check(self) -> None:
        if self._unsub_update:
            self._unsub_update()
        self._unsub_update = async_call_later(
            self.hass,
            UPDATE_INTERVAL_SECONDS,
            self._handle_scheduled_update,
        )

    @callback
    def _handle_scheduled_update(self, _now) -> None:
        self.hass.async_create_task(self.async_update())
        self._schedule_next_check()

    async def async_update(self) -> None:
        session = async_get_clientsession(self.hass)
        headers = {
            "Accept": "application/vnd.github+json",
            "User-Agent": GITHUB_USER_AGENT,
        }
        try:
            async with session.get(
                GITHUB_RELEASES_URL, headers=headers, timeout=20
            ) as response:
                if response.status == 404:
                    _LOGGER.debug("Noch kein GitHub-Release veröffentlicht")
                    return
                response.raise_for_status()
                data = await response.json()
        except Exception as err:
            _LOGGER.debug("Update-Check fehlgeschlagen: %s", err)
            return

        tag = str(data.get("tag_name", "")).lstrip("v").strip()
        if not tag:
            return

        self._release_data = data
        self._attr_latest_version = tag
        self._attr_release_url = data.get("html_url")
        self._attr_release_summary = (data.get("body") or "").strip() or None
        self._attr_title = data.get("name") or "WM Tippspiel"

        try:
            installed = AwesomeVersion(self._attr_installed_version)
            latest = AwesomeVersion(tag)
            self._attr_update_available = latest > installed
        except Exception:
            self._attr_update_available = tag != self._attr_installed_version

        self.async_write_ha_state()

    async def async_install(self, version: str | None, backup: bool) -> None:
        if not self._release_data:
            await self.async_update()
        if not self._release_data:
            raise HomeAssistantError("Keine Release-Informationen verfügbar")

        zipball = self._release_data.get("zipball_url")
        if not zipball:
            raise HomeAssistantError("Download-URL für dieses Release fehlt")

        target_version = (version or self._attr_latest_version or "").lstrip("v")
        session = async_get_clientsession(self.hass)
        headers = {"User-Agent": GITHUB_USER_AGENT}

        try:
            async with session.get(zipball, headers=headers, timeout=120) as response:
                response.raise_for_status()
                archive = await response.read()
        except Exception as err:
            raise HomeAssistantError(f"Download fehlgeschlagen: {err}") from err

        dest = Path(self.hass.config.path("custom_components")) / DOMAIN
        backup_dir = dest.with_name(f"{DOMAIN}.backup")
        temp_dir = Path(tempfile.mkdtemp(prefix="wm_tippspiel_update_"))

        try:
            extracted = self._extract_component(archive, temp_dir)

            if backup and dest.is_dir():
                if backup_dir.is_dir():
                    shutil.rmtree(backup_dir)
                shutil.copytree(dest, backup_dir)

            if dest.is_dir():
                shutil.rmtree(dest)
            shutil.copytree(extracted, dest)
        except Exception as err:
            if backup_dir.is_dir() and not dest.is_dir():
                shutil.copytree(backup_dir, dest)
            raise HomeAssistantError(f"Installation fehlgeschlagen: {err}") from err
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
            if backup_dir.is_dir():
                shutil.rmtree(backup_dir, ignore_errors=True)

        self._attr_installed_version = target_version or integration_version()
        self._attr_update_available = False
        self.async_write_ha_state()

        async_create_issue(
            self.hass,
            DOMAIN,
            "restart_required",
            is_fixable=False,
            severity=IssueSeverity.WARNING,
            translation_key="restart_required",
        )

    @staticmethod
    def _extract_component(archive: bytes, temp_dir: Path) -> Path:
        component_root = temp_dir / "component"
        component_root.mkdir(parents=True)
        prefix = f"custom_components/{DOMAIN}/"

        with zipfile.ZipFile(io.BytesIO(archive)) as zf:
            for member in zf.namelist():
                if member.endswith("/") or prefix not in member:
                    continue
                idx = member.index(prefix)
                rel = member[idx + len(prefix) :]
                if not rel:
                    continue
                target = component_root / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(member))

        if not (component_root / "manifest.json").is_file():
            raise HomeAssistantError("Ungültiges Release-Archiv (manifest.json fehlt)")

        return component_root
