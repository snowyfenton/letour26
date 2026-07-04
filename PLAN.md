# Tour de France 2026 Spoiler-Safe Stage Companion

## Context

Nathan watches each TdF stage on delayed replay in Australia (stages finish ~1:00–1:30am AEST; he watches later that day). He wants a web app that shows everything useful for the stage he's *about to watch* — while structurally guaranteeing it can never leak results from that stage. Data shown must always be "as at the close of the previous stage."

The 2026 Tour runs **4–26 July** (stage 1 is today, a TTT in Barcelona; rest days 13 & 20 July; finish Paris 26 July). Route data for all 21 stages is published pre-race, so it's spoiler-free and can be baked in statically. Only standings need a careful daily refresh.

**Confirmed requirements:**
- Per stage: distance, elevation gain, start/finish towns, terrain type (flat/hilly/mountain/TT), official profile + map images
- Standings (as at end of previous stage): all four jersey holders (yellow/green/polka dot/white), GC top 10 with time gaps, previous stage's combativity award winner
- Weather forecast for the finishing town
- Daily update via **scheduled Claude cloud agent** (chosen by Nathan)
- Hosted on **here.now**, public access
- Tech stack: Nathan's choice = mine → plain static HTML/CSS/JS (no framework, no build step)

**Validated during research:**
- procyclingstats.com works reliably via `https://markdown.new/<url>` (direct fetch is blocked; markdown.new proxy returns full content)
- letour.fr also works via markdown.new (direct fetch blocked); full 21-stage route with dates, towns, distances, and terrain types already captured
- PCS stage pages expose distance, vertical meters, and profile data per stage
- here.now: publish via bundled `publish.sh` (create → upload → finalize); permanent sites need an API key (email + one-time code flow)
- Cloud routines: isolated cloud sessions, need a git repo as code source; cron in UTC, min interval 1h

## Architecture

```
GitHub repo (letour26)                    here.now site (public)
├── site/                                 https://<slug>.here.now
│   ├── index.html    (single page)  ──publish──►  same files
│   ├── app.js        (render + weather fetch)
│   ├── style.css
│   ├── stages.json   (static: all 21 stages, built once)
│   ├── data.json     (dynamic: standings, updated daily)
│   └── img/          (profile/map images per stage)
├── scripts/publish.sh (copy of here.now helper)
└── AGENT.md          (instructions the daily routine follows)

Daily Claude cloud routine (13:00 AEST = 03:00 UTC, cron "0 3 * * *"):
  clone repo → fetch PCS previous-stage pages via markdown.new →
  rewrite data.json → commit → publish site/ to here.now
```

### Spoiler-safety design (the core of the app)

1. **Stage-pinned fetching**: the daily agent only ever requests URLs pinned to the previous stage number, e.g. `procyclingstats.com/race/tour-de-france/2026/stage-{N-1}` and its GC/points/KOM/youth tabs. It never touches the race homepage, live pages, or news. Even if it ran mid-race, it structurally cannot see current-stage data.
2. **Conservative timing**: 23:00 AEST is after any plausible viewing time for that morning's stage, and the next stage (runs ~21:00–01:30 AEST) hasn't finished. (Nathan didn't confirm his exact viewing time, so this covers early-morning through evening viewing.)
3. **Snapshot, not live**: the site is fully static; nothing on the page fetches race data at view time. The only client-side fetch is weather (Open-Meteo), which is inherently spoiler-free.
4. `data.json` carries `standingsAfterStage: N` and the site displays it explicitly ("Standings after Stage N") so any staleness is visible rather than silently wrong.

### Which stage to preview

The daily agent stamps `nextStage` in `data.json` (last completed stage + 1, skipping rest days). No client-side date arithmetic → no timezone/rest-day edge cases. On rest days the site shows a "Rest day" banner plus the upcoming stage.

## Site content (single page)

- **Header**: "Stage N — {start} → {finish}", date, terrain type badge, distance, elevation gain
- **Route**: official stage profile image + route map (downloaded into `img/` at build time; sourced from PCS/letour.fr — if hotlink/download is blocked, fall back to drawing a simple SVG elevation profile from PCS data)
- **Jerseys**: 4 cards (yellow/green/polka/white) — rider, team; labeled "after Stage N-1"
- **GC top 10**: rank, rider, team, time gap
- **Combativity**: previous stage's award winner (source: letour.fr stage rankings via markdown.new; fallback: web search by the daily agent)
- **Weather**: finish-town forecast for stage day fetched client-side from Open-Meteo (free, no key, CORS-friendly). Finish-town lat/lon geocoded once at build time and stored in `stages.json`. Shows conditions around race hours (~13:00–17:30 local)
- **Stage 1 special case**: no standings exist yet → show startlist-era note ("First stage — jerseys decided today") instead of empty tables

## Implementation steps

### Phase 1 — Build the site (today, local)

1. Scaffold repo in `C:\users\snowy\letour26` (git init, structure above)
2. Build `stages.json`: all 21 stages from letour.fr (already captured: dates, towns, km, terrain), enriched per-stage with elevation gain from PCS stage pages (via markdown.new), plus finish-town lat/lon from Open-Meteo geocoding API
3. Download profile + map images per stage into `site/img/` (try letour.fr and PCS; fallback per above)
4. Write `index.html` / `app.js` / `style.css` — clean, mobile-friendly (he'll likely check it on a phone with coffee at 5am)
5. Write initial `data.json` for stage 1 (no standings yet)
6. Write `AGENT.md`: the exact self-contained instructions the daily routine follows (which URLs to fetch, how to update data.json, how to publish, spoiler rules)

### Phase 2 — here.now publish

7. Get a permanent here.now API key: request one-time sign-in code by email, Nathan pastes it, save key to `~/.herenow/credentials`
8. Publish `site/` via `scripts/publish.sh`, confirm URL

### Phase 3 — GitHub + daily routine

9. Create GitHub repo (private, since it will hold the here.now API key for the cloud agent; needs Nathan's claude.ai GitHub integration for the routine to clone it). Fallback if private-repo access is a problem: public repo + API key embedded in the routine prompt instead
10. Create the cloud routine via `RemoteTrigger`: cron `0 13 * * *` (23:00 AEST), model claude-sonnet-5, source = the repo, prompt = "follow AGENT.md". Confirm the UTC conversion with Nathan per the schedule skill
11. Trigger one manual run (`action: "run"`) tomorrow after stage 1 finishes to verify the end-to-end loop before relying on it

### Needs Nathan during implementation
- Paste the here.now sign-in code from his email (Phase 2)
- GitHub repo access/creation confirmation (Phase 3)
- Preferred site slug (default suggestion: something like `letour26` or auto-generated)

## Verification

- Open the published here.now URL: stage 1 shows Barcelona TTT, 19.6 km, terrain badge, profile image, weather for Barcelona, "first stage" standings note
- Weather card populates from Open-Meteo in the browser (check console for CORS/fetch errors)
- Simulate the daily update by hand once: run the AGENT.md steps locally against stage 1 results (after ~1:30am AEST July 5), confirm data.json is correct and republish works
- After the routine's first real run: check https://claude.ai/code/routines run log + reload the site; confirm jerseys/GC/combativity match stage 1 outcomes and `nextStage` = 2
- Spoiler audit: grep the generated site for any stage-N data when standings say N-1; confirm app.js makes no network calls other than Open-Meteo
