"""Config-Flow für WM Tippspiel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers import selector

from .const import (
    CONF_API_KEY,
    CONF_AUTO_RESULTS,
    CONF_PLAYERS,
    CONF_SCAN_INTERVAL,
    CONF_TITLE,
    DEFAULT_SCAN_INTERVAL,
    DOMAIN,
    MIN_SCAN_INTERVAL,
)


def _parse_players(raw: str) -> list[str]:
    if not raw:
        return []
    parts = raw.replace("\n", ",").split(",")
    return [p.strip() for p in parts if p.strip()]


class WmTippspielConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            title = user_input[CONF_TITLE].strip()
            players = _parse_players(user_input.get(CONF_PLAYERS, ""))
            await self.async_set_unique_id(title.lower())
            self._abort_if_unique_id_configured()
            return self.async_create_entry(
                title=title,
                data={CONF_TITLE: title, CONF_PLAYERS: players},
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Required(CONF_TITLE, default="WM Tippspiel"): str,
                    vol.Optional(CONF_PLAYERS, default=""): selector.TextSelector(
                        selector.TextSelectorConfig(multiline=True)
                    ),
                }
            ),
        )

    @staticmethod
    @callback
    def async_get_options_flow(
        config_entry: config_entries.ConfigEntry,
    ) -> OptionsFlow:
        return WmTippspielOptionsFlowHandler()


class WmTippspielOptionsFlowHandler(OptionsFlow):
    """Optionen: API-Football für automatische Ergebnisse."""

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> ConfigFlowResult:
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        options = self.config_entry.options
        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_API_KEY,
                        default=options.get(CONF_API_KEY, ""),
                    ): selector.TextSelector(
                        selector.TextSelectorConfig(
                            type=selector.TextSelectorType.PASSWORD
                        )
                    ),
                    vol.Optional(
                        CONF_AUTO_RESULTS,
                        default=options.get(CONF_AUTO_RESULTS, True),
                    ): bool,
                    vol.Optional(
                        CONF_SCAN_INTERVAL,
                        default=options.get(CONF_SCAN_INTERVAL, DEFAULT_SCAN_INTERVAL),
                    ): vol.All(
                        vol.Coerce(int),
                        vol.Range(min=MIN_SCAN_INTERVAL, max=86400),
                    ),
                }
            ),
        )
