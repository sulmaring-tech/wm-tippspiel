"""Versions- und Update-Konstanten."""

from __future__ import annotations

import json
from pathlib import Path

DOMAIN = "wm_tippspiel"

CONF_TITLE = "title"
CONF_PLAYERS = "players"

STORAGE_VERSION = 1
STORAGE_KEY = "wm_tippspiel"

GITHUB_REPO = "sulmaring-tech/wm-tippspiel"
GITHUB_RELEASES_URL = f"https://api.github.com/repos/{GITHUB_REPO}/releases/latest"
GITHUB_USER_AGENT = "homeassistant-wm-tippspiel"

ATTR_PLAYERS = "players"
ATTR_MATCHES = "matches"
ATTR_TIPS = "tips"
ATTR_RESULTS = "results"
ATTR_STANDINGS = "standings"
ATTR_PLAYER_ID = "player_id"
ATTR_MATCH_ID = "match_id"
ATTR_HOME = "home"
ATTR_AWAY = "away"
ATTR_NAME = "name"

SERVICE_SET_TIP = "set_tip"
SERVICE_SET_RESULT = "set_result"
SERVICE_ADD_PLAYER = "add_player"
SERVICE_REMOVE_PLAYER = "remove_player"

POINTS_EXACT = 3
POINTS_TENDENCY = 1

_MANIFEST = Path(__file__).parent / "manifest.json"


def integration_version() -> str:
    """Installierte Version aus manifest.json."""
    data = json.loads(_MANIFEST.read_text(encoding="utf-8"))
    return str(data.get("version", "0.0.0"))
