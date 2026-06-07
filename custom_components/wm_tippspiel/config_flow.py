"""Config-Flow für WM Tippspiel."""

from __future__ import annotations

from typing import Any

import voluptuous as vol
from homeassistant import config_entries
from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers import selector

from .const import CONF_PLAYERS, CONF_TITLE, DOMAIN


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
