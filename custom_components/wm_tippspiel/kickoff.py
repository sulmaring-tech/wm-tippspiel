"""Anpfiff-Prüfung für Tippabgabe."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from homeassistant.util import dt as dt_util


def parse_kickoff(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


def is_past_kickoff(value: str | None, buffer_minutes: int = 0) -> bool:
    kickoff = parse_kickoff(value)
    if kickoff is None:
        return False
    cutoff = kickoff - timedelta(minutes=buffer_minutes)
    return dt_util.now() >= cutoff


def minutes_until_kickoff(value: str | None) -> float | None:
    kickoff = parse_kickoff(value)
    if kickoff is None:
        return None
    return (kickoff - dt_util.now()).total_seconds() / 60
