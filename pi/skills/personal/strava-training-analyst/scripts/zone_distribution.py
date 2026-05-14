#!/usr/bin/env python3
"""Summarize Strava activity zone JSON exports into time-in-zone tables.

Accepts files from:
  strava-local activities zones ACTIVITY_ID --out zones-ACTIVITY_ID.json

The Strava zones endpoint can vary by account/sport/device. This script is
intentionally tolerant and looks for distributions under heartrate, power, and
other zone-like entries.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def seconds_to_hms(seconds: float) -> str:
    seconds = int(round(seconds))
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}h {m:02d}m"
    if m:
        return f"{m}m {s:02d}s"
    return f"{s}s"


def zone_seconds(zone: dict[str, Any]) -> float:
    for key in ("time", "seconds", "moving_time", "elapsed_time", "duration"):
        value = zone.get(key)
        if isinstance(value, (int, float)):
            return float(value)
    return 0.0


def zone_label(index: int, zone: dict[str, Any]) -> str:
    minimum = zone.get("min")
    maximum = zone.get("max")
    if minimum is not None and maximum is not None:
        return f"Z{index} ({minimum}-{maximum})"
    if minimum is not None:
        return f"Z{index} (≥{minimum})"
    if maximum is not None:
        return f"Z{index} (≤{maximum})"
    return f"Z{index}"


def extract_distributions(data: Any) -> dict[str, list[dict[str, Any]]]:
    distributions: dict[str, list[dict[str, Any]]] = {}

    def visit(node: Any, name_hint: str = "zones") -> None:
        if isinstance(node, list):
            if node and all(isinstance(item, dict) for item in node):
                if any(zone_seconds(item) > 0 or "min" in item or "max" in item for item in node):
                    distributions.setdefault(name_hint, []).extend(node)
                    return
            for item in node:
                visit(item, name_hint)
            return

        if isinstance(node, dict):
            if isinstance(node.get("distribution_buckets"), list):
                name = str(node.get("type") or node.get("name") or name_hint).lower()
                distributions.setdefault(name, []).extend(node["distribution_buckets"])
            for key, value in node.items():
                if key != "distribution_buckets":
                    visit(value, str(key).lower())

    visit(data)
    return distributions


def bucket_key(bucket: dict[str, Any]) -> tuple[Any, Any]:
    return (bucket.get("min"), bucket.get("max"))


def sort_bucket_key(item: tuple[tuple[Any, Any], dict[str, Any]]) -> tuple[float, float]:
    (minimum, maximum), _bucket = item
    min_value = float("-inf") if minimum is None else float(minimum)
    max_value = float("inf") if maximum is None else float(maximum)
    return (min_value, max_value)


def summarize(paths: list[Path]) -> dict[str, Any]:
    totals: dict[str, dict[tuple[Any, Any], dict[str, Any]]] = {}
    file_summaries = []

    for path in paths:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SystemExit(f"Invalid JSON in {path}: {exc}") from exc
        distributions = extract_distributions(data)
        file_summaries.append({"file": str(path), "distributions": sorted(distributions)})
        for metric, buckets in distributions.items():
            metric_totals = totals.setdefault(metric, {})
            for bucket in buckets:
                key = bucket_key(bucket)
                entry = metric_totals.setdefault(key, {"seconds": 0.0, "example": bucket})
                entry["seconds"] += zone_seconds(bucket)

    output: dict[str, Any] = {"source_files": file_summaries, "metrics": {}}
    for metric, zones_by_boundary in totals.items():
        ordered = sorted(zones_by_boundary.items(), key=sort_bucket_key)
        total = sum(zone["seconds"] for _key, zone in ordered)
        output["metrics"][metric] = []
        for i, (_key, zone) in enumerate(ordered, start=1):
            example = zone["example"]
            seconds = zone["seconds"]
            output["metrics"][metric].append(
                {
                    "zone": f"Z{i}",
                    "label": zone_label(i, example),
                    "min": example.get("min"),
                    "max": example.get("max"),
                    "seconds": round(seconds),
                    "time": seconds_to_hms(seconds),
                    "percent": round((seconds / total) * 100, 1) if total else 0.0,
                }
            )
    return output


def markdown(summary: dict[str, Any]) -> str:
    lines = ["# Zone distribution", ""]
    if not summary["metrics"]:
        return "# Zone distribution\n\nNo zone distributions found in the provided files.\n"
    for metric, zones in summary["metrics"].items():
        lines.extend([f"## {metric.title()}", "", "| Zone | Time | Percent |", "| --- | ---: | ---: |"])
        for zone in zones:
            lines.append(f"| {zone['label']} | {zone['time']} | {zone['percent']}% |")
        lines.append("")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path, help="Zone JSON files exported by strava-local")
    parser.add_argument("--out", type=Path, help="Write JSON summary to this path")
    parser.add_argument("--markdown", type=Path, help="Write Markdown table to this path")
    args = parser.parse_args()

    result = summarize(args.files)
    if args.out:
        args.out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    if args.markdown:
        args.markdown.write_text(markdown(result), encoding="utf-8")
    if not args.out and not args.markdown:
        print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
