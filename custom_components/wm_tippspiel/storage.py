"""Persistente Speicherung von Spielern, Tipps und Ergebnissen."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION
from .scoring import score_tip

_MATCHES_FILE = Path(__file__).parent / "data" / "matches_wc2026.json"


def _default_matches() -> list[dict[str, Any]]:
    if _MATCHES_FILE.is_file():
        with _MATCHES_FILE.open(encoding="utf-8") as fh:
            data = json.load(fh)
        if isinstance(data, list):
            return data
    return []


def _empty_store() -> dict[str, Any]:
    return {
        "players": [],
        "matches": _default_matches(),
        "tips": {},
        "results": {},
    }


class WmTippspielStore:
    """JSON-Speicher für ein Tippspiel."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store = Store(
            hass,
            STORAGE_VERSION,
            f"{STORAGE_KEY}.{entry_id}",
        )
        self._data: dict[str, Any] = _empty_store()

    async def async_load(self) -> None:
        loaded = await self._store.async_load()
        self._data = loaded if loaded else _empty_store()
        if not self._data.get("matches"):
            self._data["matches"] = _default_matches()
        elif self._sync_matches_from_bundle():
            await self.async_save()

    def _sync_matches_from_bundle(self) -> bool:
        """Spielplan aus der Integration mit gespeicherten Tipps abgleichen."""
        bundled = _default_matches()
        if not bundled:
            return False
        stored_by_id = {
            m["id"]: m for m in self._data.get("matches", []) if m.get("id")
        }
        synced: list[dict[str, Any]] = []
        changed = False
        for bundled_match in bundled:
            match_id = bundled_match.get("id")
            if not match_id:
                continue
            stored_match = stored_by_id.get(match_id)
            if stored_match:
                updated = {**stored_match, **bundled_match}
                if updated != stored_match:
                    changed = True
                synced.append(updated)
            else:
                synced.append(bundled_match)
                changed = True
        if len(synced) != len(self._data.get("matches", [])):
            changed = True
        if changed:
            self._data["matches"] = synced
        return changed

    async def async_save(self) -> None:
        await self._store.async_save(self._data)

    @property
    def data(self) -> dict[str, Any]:
        return self._data

    def get_players(self) -> list[dict[str, str]]:
        return list(self._data.get("players", []))

    def get_matches(self) -> list[dict[str, Any]]:
        return list(self._data.get("matches", []))

    def get_match(self, match_id: str) -> dict[str, Any] | None:
        for match in self.get_matches():
            if match.get("id") == match_id:
                return match
        return None

    def add_player(self, name: str) -> dict[str, str]:
        player = {"id": uuid.uuid4().hex[:8], "name": name.strip()}
        self._data.setdefault("players", []).append(player)
        return player

    def remove_player(self, player_id: str) -> bool:
        players = self._data.get("players", [])
        new_players = [p for p in players if p.get("id") != player_id]
        if len(new_players) == len(players):
            return False
        self._data["players"] = new_players
        tips = self._data.get("tips", {})
        tips.pop(player_id, None)
        self._data["tips"] = tips
        return True

    def set_tip(self, player_id: str, match_id: str, home: int, away: int) -> None:
        if not any(p.get("id") == player_id for p in self.get_players()):
            raise ValueError(f"Unbekannter Spieler: {player_id}")
        if not self.get_match(match_id):
            raise ValueError(f"Unbekanntes Spiel: {match_id}")
        player_tips = self._data.setdefault("tips", {}).setdefault(player_id, {})
        player_tips[match_id] = {"home": int(home), "away": int(away)}

    def set_result(self, match_id: str, home: int, away: int) -> None:
        if not self.get_match(match_id):
            raise ValueError(f"Unbekanntes Spiel: {match_id}")
        results = self._data.setdefault("results", {})
        results[match_id] = {"home": int(home), "away": int(away)}

    def get_tip(self, player_id: str, match_id: str) -> dict[str, int] | None:
        return self._data.get("tips", {}).get(player_id, {}).get(match_id)

    def get_result(self, match_id: str) -> dict[str, int] | None:
        return self._data.get("results", {}).get(match_id)

    def compute_standings(self) -> list[dict[str, Any]]:
        results = self._data.get("results", {})
        standings: list[dict[str, Any]] = []
        for player in self.get_players():
            pid = player["id"]
            total = 0
            exact = 0
            tendency = 0
            tipped = 0
            for match_id, result in results.items():
                tip = self.get_tip(pid, match_id)
                if not tip:
                    continue
                tipped += 1
                pts = score_tip(tip["home"], tip["away"], result["home"], result["away"])
                total += pts
                if pts == 3:
                    exact += 1
                elif pts == 1:
                    tendency += 1
            standings.append(
                {
                    "id": pid,
                    "name": player["name"],
                    "points": total,
                    "exact": exact,
                    "tendency": tendency,
                    "tipped": tipped,
                }
            )
        standings.sort(key=lambda s: (-s["points"], -s["exact"], s["name"].lower()))
        for rank, row in enumerate(standings, start=1):
            row["rank"] = rank
        return standings

    def player_points(self, player_id: str) -> int:
        for row in self.compute_standings():
            if row["id"] == player_id:
                return int(row["points"])
        return 0
