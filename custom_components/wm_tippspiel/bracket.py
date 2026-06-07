"""Gruppentabellen und dynamische Auflösung von K.o.-Platzhaltern."""

from __future__ import annotations

import re
from typing import Any

_GROUP_RANK_RE = re.compile(r"^(\d+)\. Gruppe ([A-H])$")
_WINNER_RE = re.compile(r"^Sieger (.+)$")
_LOSER_RE = re.compile(r"^Verlierer (.+)$")
_THIRD_MULTI_RE = re.compile(r"^3\. Gruppe ([A-H](?:/[A-H])*)$")

# Reihenfolge für Drittplatz-Zuweisungen bei überlappenden Gruppen-Pools
_THIRD_PLACE_SLOTS: list[tuple[str, str, list[str]]] = [
    ("R32-9", "home", ["A", "B", "C"]),
    ("R32-9", "away", ["D", "E", "F"]),
    ("R32-10", "home", ["G", "H"]),
    ("R32-10", "away", ["A", "B", "C"]),
    ("R32-11", "home", ["D", "E", "F"]),
    ("R32-11", "away", ["G", "H"]),
]

_SCHEDULE_FIELDS = frozenset({"id", "stage", "group", "kickoff", "venue"})


def _team_stats(team: str) -> dict[str, Any]:
    return {
        "team": team,
        "played": 0,
        "won": 0,
        "drawn": 0,
        "lost": 0,
        "gf": 0,
        "ga": 0,
        "points": 0,
    }


def _teams_in_group(matches: list[dict[str, Any]], group: str) -> list[str]:
    teams: list[str] = []
    seen: set[str] = set()
    for match in matches:
        if str(match.get("group", "")).upper() != group:
            continue
        for side in ("home", "away"):
            team = match.get(side)
            if team and team not in seen:
                seen.add(team)
                teams.append(str(team))
    return teams


def _rank_key(row: dict[str, Any]) -> tuple[Any, ...]:
    return (-row["points"], -(row["gf"] - row["ga"]), -row["gf"], row["team"].lower())


def compute_group_tables(
    matches: list[dict[str, Any]], results: dict[str, dict[str, int]]
) -> dict[str, list[dict[str, Any]]]:
    tables: dict[str, list[dict[str, Any]]] = {}
    group_matches = [m for m in matches if m.get("group")]
    groups = sorted({str(m["group"]).upper() for m in group_matches if m.get("group")})

    for group in groups:
        stats = {team: _team_stats(team) for team in _teams_in_group(group_matches, group)}
        for match in group_matches:
            if str(match.get("group", "")).upper() != group:
                continue
            result = results.get(str(match.get("id")))
            if not result:
                continue
            home = str(match.get("home", ""))
            away = str(match.get("away", ""))
            if home not in stats or away not in stats:
                continue
            hg = int(result["home"])
            ag = int(result["away"])
            stats[home]["played"] += 1
            stats[away]["played"] += 1
            stats[home]["gf"] += hg
            stats[home]["ga"] += ag
            stats[away]["gf"] += ag
            stats[away]["ga"] += hg
            if hg > ag:
                stats[home]["won"] += 1
                stats[home]["points"] += 3
                stats[away]["lost"] += 1
            elif hg < ag:
                stats[away]["won"] += 1
                stats[away]["points"] += 3
                stats[home]["lost"] += 1
            else:
                stats[home]["drawn"] += 1
                stats[away]["drawn"] += 1
                stats[home]["points"] += 1
                stats[away]["points"] += 1
        tables[group] = sorted(stats.values(), key=_rank_key)
    return tables


def _group_rank_team(
    group: str, rank: int, tables: dict[str, list[dict[str, Any]]]
) -> str | None:
    table = tables.get(group.upper(), [])
    if len(table) < rank:
        return None
    row = table[rank - 1]
    if row["played"] == 0:
        return None
    return str(row["team"])


def _third_candidates(
    groups: list[str], tables: dict[str, list[dict[str, Any]]]
) -> list[str]:
    candidates: list[dict[str, Any]] = []
    for group in groups:
        table = tables.get(group.upper(), [])
        if len(table) < 3:
            continue
        third = table[2]
        if third["played"] == 0:
            continue
        candidates.append(third)
    candidates.sort(key=_rank_key)
    return [str(row["team"]) for row in candidates]


def _build_third_assignments(
    tables: dict[str, list[dict[str, Any]]],
) -> dict[tuple[str, str], str]:
    assigned: set[str] = set()
    mapping: dict[tuple[str, str], str] = {}
    for match_id, side, groups in _THIRD_PLACE_SLOTS:
        for team in _third_candidates(groups, tables):
            if team in assigned:
                continue
            mapping[(match_id, side)] = team
            assigned.add(team)
            break
    return mapping


def _match_winner_loser(
    match: dict[str, Any], result: dict[str, int]
) -> tuple[str, str]:
    home = str(match.get("home", ""))
    away = str(match.get("away", ""))
    hg = int(result["home"])
    ag = int(result["away"])
    if hg > ag:
        return home, away
    if ag > hg:
        return away, home
    return home, away


def _resolve_slot(
    template: str,
    *,
    tables: dict[str, list[dict[str, Any]]],
    winners: dict[str, str],
    losers: dict[str, str],
    third_map: dict[tuple[str, str], str],
    match_id: str,
    side: str,
) -> str:
    value = (template or "").strip()
    if not value:
        return value

    group_rank = _GROUP_RANK_RE.match(value)
    if group_rank:
        rank = int(group_rank.group(1))
        group = group_rank.group(2).upper()
        team = _group_rank_team(group, rank, tables)
        return team or value

    third_multi = _THIRD_MULTI_RE.match(value)
    if third_multi:
        team = third_map.get((match_id, side))
        return team or value

    winner = _WINNER_RE.match(value)
    if winner:
        ref = winner.group(1).strip()
        return winners.get(ref, value)

    loser = _LOSER_RE.match(value)
    if loser:
        ref = loser.group(1).strip()
        return losers.get(ref, value)

    return value


def refresh_knockout_teams(
    matches: list[dict[str, Any]],
    results: dict[str, dict[str, int]],
    templates_by_id: dict[str, dict[str, str]],
) -> bool:
    """Setzt home/away in K.o.-Spielen anhand von Ergebnissen. Gibt True bei Änderungen zurück."""
    if not matches:
        return False

    tables = compute_group_tables(matches, results)
    third_map = _build_third_assignments(tables)
    winners: dict[str, str] = {}
    losers: dict[str, str] = {}

    knockout = [m for m in matches if not m.get("group")]
    knockout.sort(key=lambda m: (m.get("kickoff") or "", str(m.get("id", ""))))

    changed = False
    for match in knockout:
        match_id = str(match.get("id", ""))
        templates = templates_by_id.get(match_id, {})
        home_tpl = templates.get("home", str(match.get("home", "")))
        away_tpl = templates.get("away", str(match.get("away", "")))

        home = _resolve_slot(
            home_tpl,
            tables=tables,
            winners=winners,
            losers=losers,
            third_map=third_map,
            match_id=match_id,
            side="home",
        )
        away = _resolve_slot(
            away_tpl,
            tables=tables,
            winners=winners,
            losers=losers,
            third_map=third_map,
            match_id=match_id,
            side="away",
        )

        if match.get("home") != home:
            match["home"] = home
            changed = True
        if match.get("away") != away:
            match["away"] = away
            changed = True

        result = results.get(match_id)
        if result and home and away and not home.startswith(("1.", "2.", "3.", "Sieger", "Verlierer")):
            winner, loser = _match_winner_loser(match, result)
            winners[match_id] = winner
            losers[match_id] = loser

    return changed


def merge_schedule_from_bundle(
    stored_match: dict[str, Any], bundled_match: dict[str, Any]
) -> dict[str, Any]:
    """Übernimmt Spielplan-Felder aus dem Bundle, behält aufgelöste Teamnamen."""
    merged = dict(stored_match)
    for field in _SCHEDULE_FIELDS:
        if field in bundled_match:
            merged[field] = bundled_match[field]
    return merged


def templates_from_matches(matches: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    return {
        str(match["id"]): {
            "home": str(match.get("home", "")),
            "away": str(match.get("away", "")),
        }
        for match in matches
        if match.get("id")
    }
