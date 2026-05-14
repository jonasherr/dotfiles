#!/usr/bin/env python3
"""Build a compact Markdown scaffold from strava-local training JSON exports."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load_json(path: str | None) -> dict[str, Any]:
    if not path:
        return {}
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def km(meters: float | int | None) -> str:
    return f"{(meters or 0) / 1000:.1f} km"


def hours(seconds: float | int | None) -> str:
    return f"{(seconds or 0) / 3600:.1f} h"


def meters(value: float | int | None) -> str:
    return f"{value or 0:.0f} m"


def week_rows(weeks: list[dict[str, Any]]) -> list[str]:
    rows = ["| Week | Activities | Distance | Time | Elevation | Longest |", "| --- | ---: | ---: | ---: | ---: | ---: |"]
    for week in weeks:
        long_activity = week.get("long_activity") or {}
        rows.append(
            "| {week} | {count} | {distance} | {time} | {elevation} | {longest} |".format(
                week=week.get("week_start", "unknown"),
                count=week.get("activity_count", 0),
                distance=km(week.get("distance_m")),
                time=hours(week.get("moving_time_s")),
                elevation=meters(week.get("elevation_gain_m")),
                longest=km(long_activity.get("distance_m")),
            )
        )
    return rows


def build_report(summary: dict[str, Any], weekly: dict[str, Any]) -> str:
    totals = summary.get("totals", {})
    consistency = summary.get("consistency", {})
    availability = summary.get("data_availability", {})
    date_range = summary.get("date_range", {}) or weekly.get("date_range", {})
    weeks = weekly.get("weeks") or summary.get("weekly_progression") or []
    longest = summary.get("longest_activity") or {}
    sport_counts = totals.get("sport_counts", {})

    lines = [
        "# Strava training analysis",
        "",
        "## Executive summary",
        "- Add a concise coaching summary here after reviewing the trends and the user's goal.",
        "",
        "## What I looked at",
        f"- Date range: {date_range.get('after', 'unknown')} to {date_range.get('before', 'unknown')}",
        f"- Activity types: {', '.join(f'{k} ({v})' for k, v in sport_counts.items()) if sport_counts else 'unknown'}",
        f"- Data available: HR {availability.get('heart_rate_activities', 0)} activities, power {availability.get('power_activities', 0)}, cadence {availability.get('cadence_activities', 0)}",
        "",
        "## Totals",
        f"- Activities: {totals.get('activity_count', 0)} across {totals.get('active_days', 0)} active days",
        f"- Distance: {km(totals.get('distance_m'))}",
        f"- Moving time: {hours(totals.get('moving_time_s'))}",
        f"- Elevation gain: {meters(totals.get('elevation_gain_m'))}",
        f"- Estimated rest days: {totals.get('rest_days_estimate', 'unknown')}",
        f"- Average activities/week: {consistency.get('average_activities_per_week', 'unknown')}",
        f"- Longest activity: {km(longest.get('distance_m'))} on {longest.get('start_date', 'unknown')}",
        "",
        "## Weekly progression",
        *week_rows(weeks),
        "",
        "## Key trends",
        "- Add observed progression, plateaus, spikes, and gaps.",
        "",
        "## Strengths",
        "- Add what is working well.",
        "",
        "## Watch-outs",
        "- Add risks such as sudden load jumps, too many hard days, or missing recovery.",
        "",
        "## Recommendations",
        "- Add practical next steps tied to the evidence above.",
        "",
        "## Suggested next week",
        "| Day | Session | Purpose |",
        "| --- | --- | --- |",
        "| Mon | Recovery or rest | Absorb training |",
        "",
        "## Caveats",
    ]
    caveats = summary.get("caveats") or []
    if caveats:
        lines.extend(f"- {item}" for item in caveats)
    else:
        lines.append("- Summary uses available Strava fields only. Missing sensors were not estimated.")
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--summary", required=True, help="Path to strava-local training summary JSON")
    parser.add_argument("--weekly", help="Path to strava-local training weekly JSON")
    parser.add_argument("--out", help="Write Markdown to this path instead of stdout")
    args = parser.parse_args()

    report = build_report(load_json(args.summary), load_json(args.weekly))
    if args.out:
        Path(args.out).write_text(report, encoding="utf-8")
    else:
        print(report, end="")


if __name__ == "__main__":
    main()
