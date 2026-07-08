#!/usr/bin/env python3
"""Fetch today's stage-pinned PCS pages and commit them to cache/ for the cloud agent.

Runs on Nathan's machine via Task Scheduler at 18:45 AEST daily during the race.
PCS's bot protection blocks every datacenter route (Anthropic cloud, GitHub Actions,
markdown.new, r.jina.ai) but accepts this residential connection, so the local
machine fetches the raw pages and the 19:00 cloud routine parses them from its
repo checkout.

Usage: python scripts/cache-pcs.py [--dry-run]
  --dry-run: fetch and report, but write nothing and never touch git.

Spoiler safety: the target stage is computed from the same UTC-date table as
AGENT.md, and only stage-pinned pages for that stage are fetched.
"""
import json
import subprocess
import sys
from datetime import date, datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RACE_START = date(2026, 7, 4)  # stage 1 raced Jul 4; target stage N on Jul 4+N
REST_DAYS = (date(2026, 7, 13), date(2026, 7, 20))
REQUIRED = ("stage-{n}", "stage-{n}-gc")
OPTIONAL = ("stage-{n}-points", "stage-{n}-kom", "stage-{n}-youth")


def target_stage(today: date) -> int:
    n = (today - RACE_START).days - sum(1 for r in REST_DAYS if today > r)
    return min(n, 21)


def fetch(page: str):
    r = subprocess.run(
        [sys.executable, str(REPO / "scripts" / "fetch-pcs.py"), page],
        capture_output=True, text=True, encoding="utf-8",
    )
    return (r.stdout, None) if r.returncode == 0 else (None, r.stderr.strip())


def main():
    dry = "--dry-run" in sys.argv
    today = datetime.now(timezone.utc).date()
    n = target_stage(today)
    if n < 1:
        print("race not started yet — nothing to cache")
        return
    print(f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ} target stage {n}")

    pages, failures = {}, []
    for tmpl in REQUIRED + OPTIONAL:
        page = tmpl.format(n=n)
        text, err = fetch(page)
        if text:
            pages[page] = text
            print(f"  {page}: {len(text)} bytes")
        else:
            failures.append(f"{page}: {err}")
            print(f"  {page}: FAILED — {err}")

    if any(tmpl.format(n=n) not in pages for tmpl in REQUIRED):
        print("required page missing — not committing anything")
        sys.exit(1)
    if dry:
        print("dry run — nothing written")
        return

    cache = REPO / "cache"
    cache.mkdir(exist_ok=True)
    for old in cache.glob("*.txt"):
        old.unlink()
    for page, text in pages.items():
        (cache / f"{page}.txt").write_text(text, encoding="utf-8")
    (cache / "meta.json").write_text(json.dumps({
        "targetStage": n,
        "fetchedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pages": sorted(pages),
        "failures": failures,
    }, indent=2), encoding="utf-8")

    for cmd in (["git", "add", "-A", "cache"],
                ["git", "commit", "-m", f"cache: PCS pages for stage {n}"],
                ["git", "pull", "--rebase", "origin", "main"],
                ["git", "push", "origin", "main"]):
        r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
        if r.returncode != 0:
            print(f"{' '.join(cmd)} failed:\n{r.stdout}{r.stderr}")
            sys.exit(1)
    print("cache committed and pushed")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
