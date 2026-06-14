"""Persistente Speicherung von Spielern, Tipps und Ergebnissen."""

from __future__ import annotations

import asyncio
import json
import re
import uuid
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .bracket import (
    merge_schedule_from_bundle,
    refresh_knockout_teams,
    templates_from_matches,
    compute_group_tables,
)
from .const import MAX_AVATAR_DATA_URL_LENGTH, STORAGE_KEY, STORAGE_VERSION
from .kickoff import is_past_kickoff
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


def _uses_legacy_knockout_ids(matches: list[dict[str, Any]]) -> bool:
    return any(str(m.get("id", "")).startswith("R32-") for m in matches)


def _remap_legacy_knockout_id(match_id: str) -> str:
    """Altes Schema R32-* / R16-* (Achtelfinale) → Strato/Website R16-* / R8-*."""
    if match_id.startswith("R32-"):
        return "R16-" + match_id[4:]
    if re.fullmatch(r"R16-\d+", match_id):
        return "R8-" + match_id[4:]
    return match_id


def _migrate_legacy_knockout_ids(data: dict[str, Any]) -> bool:
    matches = data.get("matches", [])
    if not isinstance(matches, list) or not _uses_legacy_knockout_ids(matches):
        return False

    changed = False

    results = data.get("results", {})
    if isinstance(results, dict):
        migrated: dict[str, Any] = {}
        for match_id, payload in results.items():
            new_id = _remap_legacy_knockout_id(str(match_id))
            if new_id != match_id:
                changed = True
            migrated[new_id] = payload
        data["results"] = migrated

    tips = data.get("tips", {})
    if isinstance(tips, dict):
        for player_id, player_tips in list(tips.items()):
            if not isinstance(player_tips, dict):
                continue
            migrated_tips: dict[str, Any] = {}
            for match_id, tip in player_tips.items():
                new_id = _remap_legacy_knockout_id(str(match_id))
                if new_id != match_id:
                    changed = True
                migrated_tips[new_id] = tip
            tips[player_id] = migrated_tips
        data["tips"] = tips

    return changed


class WmTippspielStore:
    """JSON-Speicher für ein Tippspiel."""

    def __init__(self, hass: HomeAssistant, entry_id: str) -> None:
        self._store = Store(
            hass,
            STORAGE_VERSION,
            f"{STORAGE_KEY}.{entry_id}",
        )
        self._data: dict[str, Any] = _empty_store()
        self._lock = asyncio.Lock()
        self._knockout_templates: dict[str, dict[str, str]] = templates_from_matches(
            _default_matches()
        )

    def _purge_orphan_tips(self) -> bool:
        """Entfernt Tipps ohne zugehörigen Spieler (z. B. nach fehlgeschlagenem Löschen)."""
        valid_ids = {p.get("id") for p in self.get_players() if p.get("id")}
        tips = self._data.get("tips", {})
        if not isinstance(tips, dict):
            self._data["tips"] = {}
            return True
        orphan_keys = [key for key in tips if key not in valid_ids]
        if not orphan_keys:
            return False
        for key in orphan_keys:
            tips.pop(key, None)
        self._data["tips"] = tips
        return True

    async def async_load(self) -> None:
        async with self._lock:
            loaded = await self._store.async_load()
            self._data = loaded if loaded else _empty_store()
            if not self._data.get("matches"):
                self._data["matches"] = _default_matches()
            changed = self._purge_orphan_tips()
            if _migrate_legacy_knockout_ids(self._data):
                changed = True
            if self._sync_matches_from_bundle():
                changed = True
            if self._refresh_knockout_teams():
                changed = True
            self._ensure_standings_snapshot()
            if changed:
                await self._store.async_save(self._data)

    def _sync_matches_from_bundle(self) -> bool:
        """Spielplan aus der Integration mit gespeicherten Tipps abgleichen."""
        bundled = _default_matches()
        if not bundled:
            return False
        self._knockout_templates = templates_from_matches(bundled)
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
                updated = merge_schedule_from_bundle(stored_match, bundled_match)
                if updated != stored_match:
                    changed = True
                synced.append(updated)
            else:
                synced.append(dict(bundled_match))
                changed = True
        if len(synced) != len(self._data.get("matches", [])):
            changed = True
        if changed:
            self._data["matches"] = synced
        return changed

    def _refresh_knockout_teams(self) -> bool:
        results = self._data.get("results", {})
        if not isinstance(results, dict):
            results = {}
        matches = self._data.get("matches", [])
        if not isinstance(matches, list):
            return False
        return refresh_knockout_teams(matches, results, self._knockout_templates)

    def get_group_tables(self) -> dict[str, list[dict[str, Any]]]:
        results = self._data.get("results", {})
        if not isinstance(results, dict):
            results = {}
        return compute_group_tables(self.get_matches(), results)

    async def async_save(self) -> None:
        async with self._lock:
            await self._store.async_save(self._data)

    @property
    def data(self) -> dict[str, Any]:
        return self._data

    def get_players(self) -> list[dict[str, str]]:
        return list(self._data.get("players", []))

    def get_matches(self) -> list[dict[str, Any]]:
        return list(self._data.get("matches", []))

    def get_matches_for_card(self) -> list[dict[str, Any]]:
        """Schlanke Spielliste für die Lovelace-Karte."""
        lean: list[dict[str, Any]] = []
        for match in self.get_matches():
            lean.append(
                {
                    "id": match.get("id"),
                    "group": match.get("group"),
                    "stage": match.get("stage"),
                    "home": match.get("home"),
                    "away": match.get("away"),
                    "kickoff": match.get("kickoff"),
                    "venue": match.get("venue"),
                }
            )
        return lean

    def update_match_schedule(
        self,
        match_id: str,
        *,
        kickoff: str | None = None,
        home: str | None = None,
        away: str | None = None,
    ) -> bool:
        """Aktualisiert Anstoßzeit und ggf. Teamnamen (nur Gruppenspiele)."""
        match = self.get_match(match_id)
        if not match:
            return False
        changed = False
        if kickoff and str(match.get("kickoff") or "") != str(kickoff):
            match["kickoff"] = kickoff
            changed = True
        if match.get("group"):
            if home and match.get("home") != home:
                match["home"] = home
                changed = True
            if away and match.get("away") != away:
                match["away"] = away
                changed = True
        return changed

    def get_match(self, match_id: str) -> dict[str, Any] | None:
        mid = str(match_id)
        for match in self.get_matches():
            if str(match.get("id")) == mid:
                return match
        return None

    def add_player(self, name: str) -> dict[str, str]:
        player = {"id": uuid.uuid4().hex[:8], "name": name.strip()}
        self._data.setdefault("players", []).append(player)
        return player

    def get_player(self, player_id: str) -> dict[str, str] | None:
        resolved = self._resolve_player_key(self.get_players(), player_id)
        if not resolved:
            return None
        for player in self.get_players():
            if player.get("id") == resolved:
                return player
        return None

    @staticmethod
    def _validate_avatar_data_url(avatar: str) -> str:
        value = str(avatar).strip()
        if not value:
            return ""
        if not value.startswith("data:image/"):
            raise ValueError("Avatar muss ein Bild im Data-URL-Format sein.")
        if len(value) > MAX_AVATAR_DATA_URL_LENGTH:
            raise ValueError("Avatar ist zu groß (max. ca. 120 KB).")
        return value

    def update_player_profile(
        self,
        player_id: str,
        *,
        name: str | None = None,
        avatar: str | None = None,
        remove_avatar: bool = False,
    ) -> dict[str, str]:
        player = self.get_player(player_id)
        if not player:
            raise ValueError(f"Spieler nicht gefunden: {player_id}")

        if name is not None:
            cleaned = str(name).strip()
            if not cleaned:
                raise ValueError("Name darf nicht leer sein.")
            lowered = cleaned.lower()
            for other in self.get_players():
                if other.get("id") == player.get("id"):
                    continue
                if str(other.get("name", "")).strip().lower() == lowered:
                    raise ValueError(f"Spielername bereits vergeben: {cleaned}")
            player["name"] = cleaned

        if remove_avatar:
            player.pop("avatar", None)
        elif avatar is not None:
            validated = self._validate_avatar_data_url(avatar)
            if validated:
                player["avatar"] = validated
            else:
                player.pop("avatar", None)

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
        self._purge_orphan_tips()
        return True

    @staticmethod
    def _resolve_tip_match_key(player_tips: dict, match_id: str) -> str | None:
        if not player_tips:
            return None
        if match_id in player_tips:
            return match_id
        mid = str(match_id)
        for key in player_tips:
            if str(key) == mid:
                return key
        return None

    def get_player_tips(self, player_id: str) -> dict[str, Any]:
        tips_root = self._data.get("tips", {})
        if not isinstance(tips_root, dict):
            return {}
        resolved = self._resolve_player_key(self.get_players(), player_id) or str(
            player_id
        )
        merged: dict[str, Any] = {}
        for key, player_tips in tips_root.items():
            if str(key) in {str(resolved), str(player_id)} and isinstance(
                player_tips, dict
            ):
                merged.update(player_tips)
        return merged

    def set_tip(self, player_id: str, match_id: str, home: int, away: int) -> None:
        resolved_player = self._resolve_player_key(self.get_players(), player_id)
        if not resolved_player:
            raise ValueError(f"Unbekannter Spieler: {player_id}")
        match = self.get_match(match_id)
        if not match:
            raise ValueError(f"Unbekanntes Spiel: {match_id}")
        if is_past_kickoff(match.get("kickoff")):
            raise ValueError("Tippabgabe geschlossen – Anpfiff bereits erfolgt.")
        tips = self._data.setdefault("tips", {})
        for key in list(tips):
            if str(key) in {str(resolved_player), str(player_id)} and key != resolved_player:
                tips.pop(key, None)
        player_tips = tips.setdefault(resolved_player, {})
        player_tips[str(match["id"])] = {"home": int(home), "away": int(away)}

    async def async_set_tip(
        self, player_id: str, match_id: str, home: int, away: int
    ) -> None:
        async with self._lock:
            self.set_tip(player_id, match_id, home, away)
            await self._store.async_save(self._data)

    @staticmethod
    def _resolve_player_key(players: list[dict], player_id: str) -> str | None:
        if not players:
            return None
        for player in players:
            pid = player.get("id")
            if pid == player_id or str(pid) == str(player_id):
                return str(pid)
        return None

    def clear_tip(self, player_id: str, match_id: str) -> bool:
        players = self.get_players()
        resolved_player = self._resolve_player_key(players, player_id)
        if not resolved_player:
            raise ValueError(f"Unbekannter Spieler: {player_id}")
        match = self.get_match(match_id)
        if not match:
            raise ValueError(f"Unbekanntes Spiel: {match_id}")
        if is_past_kickoff(match.get("kickoff")):
            raise ValueError("Tippabgabe geschlossen – Anpfiff bereits erfolgt.")
        tips = self._data.setdefault("tips", {})
        deleted = False
        player_keys = {
            str(key)
            for key in tips
            if str(key) in {str(resolved_player), str(player_id)}
        }
        for key in list(tips):
            if str(key) not in player_keys:
                continue
            player_tips = tips.get(key)
            if not isinstance(player_tips, dict):
                continue
            resolved = self._resolve_tip_match_key(player_tips, match_id)
            if not resolved:
                continue
            del player_tips[resolved]
            deleted = True
            if not player_tips:
                tips.pop(key, None)
        return deleted

    async def async_clear_tip(self, player_id: str, match_id: str) -> bool:
        async with self._lock:
            deleted = self.clear_tip(player_id, match_id)
            if deleted:
                await self._store.async_save(self._data)
            return deleted

    def set_result(self, match_id: str, home: int, away: int) -> None:
        if not self.get_match(match_id):
            raise ValueError(f"Unbekanntes Spiel: {match_id}")
        results = self._data.setdefault("results", {})
        results[match_id] = {"home": int(home), "away": int(away)}
        self._refresh_knockout_teams()
        self._refresh_rank_changes()

    def clear_result(self, match_id: str) -> bool:
        results = self._data.get("results", {})
        if match_id not in results:
            return False
        del results[match_id]
        self._data["results"] = results
        self._refresh_knockout_teams()
        self._refresh_rank_changes()
        return True

    def clear_all_results(self) -> int:
        results = self._data.get("results", {})
        count = len(results)
        self._data["results"] = {}
        self._refresh_knockout_teams()
        self._refresh_rank_changes()
        return count

    def get_results(self) -> dict[str, dict[str, int]]:
        return dict(self._data.get("results", {}))

    def describe_stored_results(self) -> str:
        results = self._data.get("results", {})
        if not results:
            return "keine Ergebnisse gespeichert"
        parts: list[str] = []
        for match_id, result in sorted(results.items()):
            match = self.get_match(match_id)
            if match:
                label = f"{match.get('home', '?')} vs {match.get('away', '?')}"
                parts.append(f"{match_id} ({label} {result['home']}:{result['away']})")
            else:
                parts.append(f"{match_id} ({result['home']}:{result['away']})")
        return ", ".join(parts)

    def get_tip(self, player_id: str, match_id: str) -> dict[str, int] | None:
        return self._data.get("tips", {}).get(player_id, {}).get(match_id)

    def get_result(self, match_id: str) -> dict[str, int] | None:
        return self._data.get("results", {}).get(match_id)

    def _ensure_standings_snapshot(self) -> None:
        if self._data.get("standings_rank_prev") is not None:
            return
        self._data["standings_rank_prev"] = {
            row["id"]: row["rank"] for row in self._build_standings_rows()
        }

    def _refresh_rank_changes(self) -> None:
        prev = self._data.get("standings_rank_prev")
        if prev is None:
            self._ensure_standings_snapshot()
            prev = self._data.get("standings_rank_prev", {})
        standings = self._build_standings_rows()
        changes: dict[str, int] = {}
        for row in standings:
            old_rank = prev.get(row["id"])
            if old_rank is None:
                changes[row["id"]] = 0
            else:
                changes[row["id"]] = int(old_rank) - int(row["rank"])
        self._data["rank_changes"] = changes
        self._data["standings_rank_prev"] = {
            row["id"]: row["rank"] for row in standings
        }

    def _build_standings_rows(self) -> list[dict[str, Any]]:
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

    def compute_standings(self) -> list[dict[str, Any]]:
        standings = self._build_standings_rows()
        changes = self._data.get("rank_changes") or {}
        for row in standings:
            row["rank_change"] = int(changes.get(row["id"], 0))
        return standings

    def player_points(self, player_id: str) -> int:
        for row in self.compute_standings():
            if row["id"] == player_id:
                return int(row["points"])
        return 0
