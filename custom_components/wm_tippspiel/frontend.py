"""Lovelace-Ressource für die WM-Tippspiel-Karte automatisch registrieren."""

from __future__ import annotations

import logging
from typing import Any

from homeassistant.components.lovelace.resources import ResourceStorageCollection
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.event import async_call_later

from .const import DOMAIN, integration_version

_LOGGER = logging.getLogger(__name__)

CARD_URL = "/wm_tippspiel/wm-tippspiel-card.js"


async def async_register_card(hass: HomeAssistant) -> None:
    """Karten-Ressource in Lovelace anlegen bzw. Version aktualisieren."""
    domain_data = hass.data.setdefault(DOMAIN, {})
    version = integration_version()
    if domain_data.get("_card_resource_version") == version:
        return

    lovelace = hass.data.get("lovelace")
    if lovelace is None:

        @callback
        def _wait_lovelace(_now: Any) -> None:
            hass.async_create_task(async_register_card(hass))

        async_call_later(hass, 10, _wait_lovelace)
        return

    resources: ResourceStorageCollection | Any = (
        lovelace.resources if hasattr(lovelace, "resources") else lovelace["resources"]
    )

    if not isinstance(resources, ResourceStorageCollection):
        _register_yaml_mode(hass)
        return

    await resources.async_get_info()

    if not resources.loaded:

        @callback
        def _retry(_now: Any) -> None:
            hass.async_create_task(async_register_card(hass))

        async_call_later(hass, 5, _retry)
        return

    versioned_url = f"{CARD_URL}?v={version}"

    for item in resources.async_items():
        url = item.get("url", "")
        if not url.startswith(CARD_URL):
            continue
        if url.endswith(version):
            domain_data["_card_resource_version"] = version
            return
        _LOGGER.debug("Aktualisiere Lovelace-Ressource: %s", versioned_url)
        await resources.async_update_item(
            item["id"], {"res_type": "module", "url": versioned_url}
        )
        domain_data["_card_resource_version"] = version
        return

    _LOGGER.debug("Registriere Lovelace-Ressource: %s", versioned_url)
    await resources.async_create_item({"res_type": "module", "url": versioned_url})
    domain_data["_card_resource_version"] = version


def _register_yaml_mode(hass: HomeAssistant) -> None:
    """YAML-Lovelace: Karte als extra JS-Modul laden."""
    from homeassistant.components.frontend import add_extra_js_url

    versioned_url = f"{CARD_URL}?v={integration_version()}"
    add_extra_js_url(hass, versioned_url)
    hass.data.setdefault(DOMAIN, {})["_card_resource_version"] = integration_version()
