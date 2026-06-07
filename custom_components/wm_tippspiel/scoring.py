"""Punkteberechnung für WM-Tipps."""

from __future__ import annotations

from .const import POINTS_EXACT, POINTS_TENDENCY


def _tendency(home: int, away: int) -> int:
    """1 = Heim gewinnt, 0 = Unentschieden, -1 = Auswärts gewinnt."""
    if home > away:
        return 1
    if home < away:
        return -1
    return 0


def score_tip(tip_home: int, tip_away: int, result_home: int, result_away: int) -> int:
    """Berechnet Punkte: 3 exakt, 1 richtige Tendenz, sonst 0."""
    if tip_home == result_home and tip_away == result_away:
        return POINTS_EXACT
    if _tendency(tip_home, tip_away) == _tendency(result_home, result_away):
        return POINTS_TENDENCY
    return 0
