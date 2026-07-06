#!/usr/bin/env python3
"""Fetch decimal stage-winner odds for one Tour de France 2026 stage from Oddschecker.

Usage: python scripts/fetch-odds.py <stage-number>

Prints the `odds` object for site/data.json to stdout, or the literal `null` if the
market can't be fetched/parsed (exit code stays 0 — a missing market must never
block the daily publish).

Spoiler safety: the URL is pinned to the requested stage and only the odds table
(data-name / data-odig attributes) is read — no narrative on the page is used.
"""
import json
import re
import statistics
import subprocess
import sys
from datetime import datetime, timezone

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
TOP_N = 8

# Oddschecker rider names -> PCS spelling used elsewhere on the site
NAME_FIXES = {
    "Mathieu va der Poel": "Mathieu van der Poel",
    "Jonas Vingegaard Hansen": "Jonas Vingegaard",
    "Isaac Del Toro": "Isaac del Toro",
    "Lucas Plapp": "Luke Plapp",
    "Tadej Pogacar": "Tadej Pogačar",
}


def fetch(stage: int):
    url = (f"https://www.oddschecker.com/cycling/tour-de-france/"
           f"tour-de-france-stage-{stage}/winner")
    # curl, not urllib: Oddschecker 403s Python's TLS fingerprint but accepts curl's
    html = subprocess.run(
        ["curl", "-sL", "--max-time", "30", "-A", UA, "-H", "Accept: text/html", url],
        capture_output=True, check=True,
    ).stdout.decode("utf-8", "ignore")

    riders = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S):
        name = re.search(r'data-name="([^"]+)"', row)
        if not name:
            continue
        odds = [float(x) for x in re.findall(r'data-odig="([\d.]+)"', row) if float(x) > 1]
        if len(odds) < 3:  # need a real market, not a single stray price
            continue
        riders.append({
            "rider": NAME_FIXES.get(name.group(1), name.group(1)),
            "median": round(statistics.median(odds), 2),
            "best": round(max(odds), 2),
            "bookies": len(odds),
        })
    if not riders:
        raise ValueError("no odds rows parsed")

    riders.sort(key=lambda r: r["median"])
    n_bookies = max(r.pop("bookies") for r in riders)
    return {
        "stage": stage,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": f"Oddschecker — market median across {n_bookies} bookmakers",
        "riders": riders[:TOP_N],
    }


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to cp1252
    stage = int(sys.argv[1])
    try:
        print(json.dumps(fetch(stage), indent=2, ensure_ascii=False))
    except Exception as e:
        print("null")
        print(f"odds unavailable for stage {stage}: {e}", file=sys.stderr)
