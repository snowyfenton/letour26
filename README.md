# Le Tour 26 — Spoiler-Safe Stage Companion

A static site for watching Tour de France 2026 stage replays on Australian delay
without ever being spoiled. Shows the upcoming stage's route (distance, elevation,
towns, official profile/map), finish-town weather, and standings **frozen as at the
close of the previous stage** — jerseys, GC top 10, and the combativity award.

- **Site**: static HTML/CSS/JS in `site/`, hosted on here.now
- **Static route data**: `site/stages.json` (all 21 stages, built once from letour.fr + procyclingstats)
- **Daily standings**: `site/data.json`, rewritten and pushed to `main` each day at
  09:00 UTC (19:00 AEST) by a scheduled Claude cloud routine following `AGENT.md`.
  The live page fetches it from raw.githubusercontent.com, so a push is a deployment —
  the here.now shell only needs republishing when code or images change
- **Weather**: fetched client-side from Open-Meteo at view time (inherently spoiler-free)
- **Spoiler safety**: the daily agent only ever fetches URLs pinned to already-watched
  stage numbers; the page itself makes no race-data network calls. See `AGENT.md`.

## Layout

```
site/          the published site (index.html, app.js, style.css, stages.json, data.json, img/)
scripts/       publish.sh (here.now helper), fetch-images.sh (one-time image scrape)
AGENT.md       instructions for the daily cloud routine
PLAN.md        original build plan
```

The here.now API key is NOT stored in this repo — locally it lives in
`~/.herenow/credentials`; the daily cloud routine receives it via its task prompt.

## Manual publish

```bash
bash scripts/publish.sh site --slug <SLUG>   # key auto-loaded from ~/.herenow/credentials
```
