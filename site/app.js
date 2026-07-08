/* Le Tour 26 — spoiler-safe stage companion.
   The ONLY network calls here are to local JSON files and Open-Meteo (weather).
   No race data is ever fetched live — standings come frozen in data.json.
   Views: home ("today") and per-stage detail via hash routing (#stage/N). */

const TYPE_LABELS = {
  flat: "Flat", hilly: "Hilly", mountain: "Mountain",
  ttt: "Team Time Trial", itt: "Individual Time Trial",
};

const WMO = {
  0: ["☀️", "Clear sky"], 1: ["🌤️", "Mainly clear"], 2: ["⛅", "Partly cloudy"], 3: ["☁️", "Overcast"],
  45: ["🌫️", "Fog"], 48: ["🌫️", "Rime fog"],
  51: ["🌦️", "Light drizzle"], 53: ["🌦️", "Drizzle"], 55: ["🌧️", "Heavy drizzle"],
  61: ["🌦️", "Light rain"], 63: ["🌧️", "Rain"], 65: ["🌧️", "Heavy rain"],
  66: ["🌧️", "Freezing rain"], 67: ["🌧️", "Freezing rain"],
  71: ["🌨️", "Light snow"], 73: ["🌨️", "Snow"], 75: ["❄️", "Heavy snow"], 77: ["❄️", "Snow grains"],
  80: ["🌦️", "Light showers"], 81: ["🌧️", "Showers"], 82: ["⛈️", "Heavy showers"],
  85: ["🌨️", "Snow showers"], 86: ["🌨️", "Snow showers"],
  95: ["⛈️", "Thunderstorm"], 96: ["⛈️", "Thunderstorm, hail"], 99: ["⛈️", "Thunderstorm, hail"],
};

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  return new Date(iso + "T12:00:00Z").toLocaleDateString("en-AU", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  });
}

function pad2(n) { return String(n).padStart(2, "0"); }

let ctx = null; // { stagesDoc, factsDoc, data } — loaded once, then routed on hashchange

async function main() {
  const app = document.getElementById("app");
  try {
    const bust = "?v=" + Date.now(); // never let a cached data.json show stale standings silently
    // Standings are committed daily to GitHub by the update routine; the site shell on
    // here.now is static. Fall back to the local (possibly stale) copy if GitHub is down.
    const DATA_URL = "https://raw.githubusercontent.com/snowyfenton/letour26/main/site/data.json";
    const stagesDoc = await (await fetch("stages.json" + bust)).json();
    const factsDoc = await (await fetch("facts.json" + bust)).json();
    let data, stale = false;
    try {
      const res = await fetch(DATA_URL + bust, { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      data = await res.json();
    } catch (err) {
      data = await (await fetch("data.json" + bust)).json();
      stale = true;
    }
    data._stale = stale;

    ctx = { stagesDoc, factsDoc, data };
    window.addEventListener("hashchange", route);
    route();
  } catch (e) {
    app.innerHTML = `<div class="card">Couldn't load stage data (${esc(e.message)}). Try refreshing.</div>`;
  }
}

function route() {
  if (!ctx) return;
  const app = document.getElementById("app");
  const { stagesDoc, factsDoc, data } = ctx;

  renderFreshness(data);

  const m = location.hash.match(/^#stage\/(\d{1,2})$/);
  const detailStage = m ? stagesDoc.stages.find(s => s.n === Number(m[1])) : null;

  if (detailStage) {
    renderStageDetail(app, stagesDoc, data, detailStage, factsDoc);
    loadWeather(detailStage);
  } else {
    const stage = stagesDoc.stages.find(s => s.n === data.nextStage) || stagesDoc.stages[0];
    renderHome(app, stagesDoc, data, stage, factsDoc);
    loadWeather(stage);
  }
  window.scrollTo(0, 0);
}

function renderFreshness(data) {
  const fresh = document.getElementById("freshness");
  if (data._stale) {
    fresh.innerHTML = `⚠️ Couldn't reach the standings snapshot — showing possibly out-of-date data`;
    fresh.style.color = "#ff8fa0";
    // continue rendering with the fallback copy
  } else if (data.standingsAfterStage > 0) {
    fresh.innerHTML = `Standings frozen as at the end of <strong>Stage ${data.standingsAfterStage}</strong>`;
  } else {
    fresh.innerHTML = `Race not yet started — <strong>no standings yet</strong>`;
  }
}

/* ---------- Shared stage renderers (used by home + detail views) ---------- */

function stageHeadCard(stage) {
  return `<div class="card stage-head">
    <div class="stage-topline">
      <span class="stage-num">Stage ${stage.n}</span>
      <span class="badge ${esc(stage.type)}">${TYPE_LABELS[stage.type] || esc(stage.type)}</span>
      <span class="stage-date">${fmtDate(stage.date)}</span>
    </div>
    <div class="stage-route">${esc(stage.start)}<span class="arrow">→</span>${esc(stage.finish)}</div>
    <div class="stage-stats">
      <div class="stat"><div class="v">${Number(stage.km)} km</div><div class="k">Distance</div></div>
      <div class="stat"><div class="v">${stage.elevationM.toLocaleString()} m</div><div class="k">Elevation gain</div></div>
    </div>
  </div>`;
}

function stageImages(stage) {
  const nn = pad2(stage.n);
  return `<figure class="card imgcard">
    <img src="img/stage-${nn}-profile.jpg" alt="Stage ${stage.n} profile" loading="lazy"
         onerror="this.closest('figure').style.display='none'">
    <figcaption>Official stage profile — letour.fr</figcaption>
  </figure>
  <figure class="card imgcard">
    <img src="img/stage-${nn}-map.jpg" alt="Stage ${stage.n} route map" loading="lazy"
         onerror="this.closest('figure').style.display='none'">
  </figure>`;
}

function weatherSection(stage) {
  return `<h2 class="section">Weather in ${esc(stage.finish)}</h2>
    <div class="card" id="weather"><span class="weather-fail">Loading forecast…</span></div>`;
}

function historyFactCard(stage, factsDoc) {
  const factEntry = factsDoc && Array.isArray(factsDoc.facts)
    ? factsDoc.facts.find(f => f.stage === stage.n)
    : null;
  if (!factEntry) return "";
  return `<div class="card history-card">
    <span class="medal">🏛️</span>
    <span>${esc(factEntry.fact)}</span>
  </div>`;
}

function expectCard(stage) {
  if (!stage.expect) return "";
  return `<div class="card history-card expect-card">
    <span class="medal">🔭</span>
    <span><strong class="expect-label">What to expect</strong>${esc(stage.expect)}</span>
  </div>`;
}

/* ---------- Home ("today") view ---------- */

function renderHome(app, stagesDoc, data, stage, factsDoc) {
  const parts = [];

  parts.push(renderStrip(stagesDoc, data, null));

  if (data.restDay) {
    parts.push(`<div class="card rest-banner">
      <h2>Rest day</h2>
      <p>No stage today. Next up: Stage ${stage.n} on ${fmtDate(stage.date)}.</p>
    </div>`);
  }

  parts.push(stageHeadCard(stage));
  parts.push(expectCard(stage));
  parts.push(stageImages(stage));
  parts.push(weatherSection(stage));
  parts.push(historyFactCard(stage, factsDoc));

  // Stage-winner odds for the upcoming stage. odds.stage must match nextStage so a
  // stale or early-seeded snapshot is hidden rather than shown against the wrong stage.
  if (data.odds && data.odds.stage === data.nextStage
      && Array.isArray(data.odds.riders) && data.odds.riders.length) {
    parts.push(renderOdds(data.odds));
  }

  // Standings
  if (data.standingsAfterStage > 0) {
    parts.push(`<h2 class="section">Jerseys <em>after Stage ${data.standingsAfterStage}</em></h2>`);
    parts.push(`<div class="jerseys">
      ${jerseyCard("yellow", "Yellow — Overall", data.jerseys.yellow)}
      ${jerseyCard("green", "Green — Points", data.jerseys.green)}
      ${jerseyCard("polka", "Polka Dot — Mountains", data.jerseys.polkaDot)}
      ${jerseyCard("whitej", "White — Young Rider", data.jerseys.white)}
    </div>`);

    if (Array.isArray(data.gcTop10) && data.gcTop10.length) {
      parts.push(`<h2 class="section">General Classification <em>top 10</em></h2>`);
      parts.push(`<div class="card"><table class="gc">${data.gcTop10.map(r => `
        <tr class="${r.rank === 1 ? "leader" : ""}">
          <td class="rank">${r.rank}</td>
          <td class="name">${esc(r.rider)}<span class="team">${esc(r.team || "")}</span></td>
          <td class="gap">${r.rank === 1 ? esc(r.gap || "—") : esc(r.gap)}</td>
        </tr>`).join("")}</table></div>`);
    }

    if (data.abandons && Array.isArray(data.abandons.riders)) {
      parts.push(renderAbandons(data.abandons));
    }

    if (data.combativity && data.combativity.rider) {
      parts.push(`<h2 class="section">Most Combative <em>Stage ${data.combativity.stage || data.standingsAfterStage}</em></h2>`);
      parts.push(`<div class="card combativity">
        <span class="medal">🔥</span>
        <span>
          <span class="rider">${esc(data.combativity.rider)}</span>
          <span class="team"> — ${esc(data.combativity.team || "")}</span>
        </span>
      </div>`);
    }
  } else if (data.note) {
    parts.push(`<div class="card note-card">${esc(data.note)}</div>`);
  }

  if (data.prevStageSummary) {
    parts.push(`<h2 class="section">Previous stage</h2>
      <div class="card note-card">${esc(data.prevStageSummary)}</div>`);
  }

  if (data.fantasy && Array.isArray(data.fantasy.days) && data.fantasy.days.length) {
    parts.push(renderFantasy(data.fantasy, stagesDoc));
  }

  app.innerHTML = parts.join("");
}

/* ---------- Per-stage detail view ---------- */

function countdownLine(stage, data) {
  if (stage.n <= data.standingsAfterStage) {
    return `<p class="countdown watched-line">✅ Watched — standings on the home page include this stage.</p>`;
  }
  // "Today" means today in France, where the stage actually runs.
  const todayParis = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
  const days = Math.round((Date.parse(stage.date) - Date.parse(todayParis)) / 86400000);
  let label;
  if (days <= 0) label = "🚴 Racing today (French time) — results stay hidden until you've watched.";
  else if (days === 1) label = "🗓️ Racing tomorrow";
  else label = `🗓️ Racing in ${days} days`;
  return `<p class="countdown">${label}</p>`;
}

function renderStageDetail(app, stagesDoc, data, stage, factsDoc) {
  const parts = [];

  parts.push(renderStrip(stagesDoc, data, stage.n));

  const prev = stagesDoc.stages.find(s => s.n === stage.n - 1);
  const next = stagesDoc.stages.find(s => s.n === stage.n + 1);
  parts.push(`<div class="stage-nav">
    <a class="sn-back" href="#">← Back to today</a>
    <span class="sn-pn">
      ${prev ? `<a href="#stage/${prev.n}">← Stage ${prev.n}</a>` : ""}
      ${next ? `<a href="#stage/${next.n}">Stage ${next.n} →</a>` : ""}
    </span>
  </div>`);

  parts.push(countdownLine(stage, data));
  parts.push(stageHeadCard(stage));
  parts.push(expectCard(stage));
  parts.push(stageImages(stage));
  parts.push(weatherSection(stage));
  parts.push(historyFactCard(stage, factsDoc));

  // Fantasy pick for this stage, if it's inside the published picks window.
  // No standings/jerseys/GC/odds here — those stay on the home page only.
  if (data.fantasy && Array.isArray(data.fantasy.days)) {
    const day = data.fantasy.days.find(d => d.stage === stage.n);
    if (day) {
      parts.push(`<h2 class="section">Fantasy Pick <em>Stage ${stage.n}</em></h2>`);
      parts.push(fantasyDayCard(day, stagesDoc));
      parts.push(`<p class="fantasy-provenance">${
        data.fantasy.formThroughStage > 0
          ? `Form analysis uses results up to <strong>Stage ${data.fantasy.formThroughStage}</strong> only — nothing newer is revealed here.`
          : `Based on pre-race form and the route — the race hadn't started when this was written.`
      }</p>`);
    }
  }

  app.innerHTML = parts.join("");
}

/* ---------- Tour strip ---------- */

function renderStrip(stagesDoc, data, currentN) {
  const TYPE_SHORT = { flat: "Flat", hilly: "Hilly", mountain: "Mtn", ttt: "TTT", itt: "ITT" };
  const items = [
    ...stagesDoc.stages.map(s => ({ date: s.date, s })),
    ...(stagesDoc.restDays || []).map(d => ({ date: d, rest: true })),
  ].sort((a, b) => (a.date < b.date ? -1 : 1));

  const cells = items.map(it => {
    if (it.rest) {
      return `<div class="ts-cell rest" title="Rest day — ${esc(fmtDate(it.date))}">
        <div class="ts-n">☕</div><div class="ts-type">Rest</div>
      </div>`;
    }
    const s = it.s;
    const state = s.n <= data.standingsAfterStage ? "watched"
      : s.n === data.nextStage ? "next" : "future";
    const current = s.n === currentN ? " current" : "";
    const title = `Stage ${s.n} · ${TYPE_LABELS[s.type] || s.type} · ${s.start} → ${s.finish} · ${fmtDate(s.date)}`;
    return `<a class="ts-cell ${esc(s.type)} ${state}${current}" href="#stage/${s.n}" title="${esc(title)}">
      <div class="ts-n">${s.n}</div><div class="ts-type">${TYPE_SHORT[s.type] || esc(s.type)}</div>
    </a>`;
  }).join("");

  return `<div class="card strip-card">
    <div class="tour-strip">${cells}</div>
    <p class="strip-legend">Tap a stage for its route, map &amp; forecast · Dimmed = watched · <span class="lg-next">outlined</span> = up next · Mtn = Mountain · TTT/ITT = Time Trial</p>
  </div>`;
}

function renderAbandons(ab) {
  const head = `<h2 class="section">No longer in the race <em>through Stage ${Number(ab.throughStage) || "?"}</em></h2>`;
  if (!ab.riders.length) {
    return head + `<div class="card note-card">Every rider who started is still in the race.</div>`;
  }
  return head + `<div class="card"><table class="gc abandons">${ab.riders.map(r => `
    <tr>
      <td class="name">${esc(r.rider)}<span class="team">${esc(r.team || "")}</span></td>
      <td class="gap abandon-how">${esc(r.how || "")}</td>
      <td class="gap">Stage ${Number(r.stage) || "?"}</td>
    </tr>`).join("")}</table></div>`;
}

function renderOdds(odds) {
  const fetched = new Date(odds.fetchedAt).toLocaleString("en-AU", {
    weekday: "short", hour: "numeric", minute: "2-digit",
    timeZone: "Australia/Melbourne", hour12: true,
  });
  return `<h2 class="section">Stage ${odds.stage} Odds <em>to win · decimal</em></h2>
    <div class="card"><table class="gc odds">
      <tr class="odds-head"><td></td><td class="gap">Market</td><td class="gap">Best</td></tr>
      ${odds.riders.map(r => `
      <tr>
        <td class="name">${esc(r.rider)}</td>
        <td class="gap">${r.median.toFixed(2)}</td>
        <td class="gap odds-best">${r.best.toFixed(2)}</td>
      </tr>`).join("")}
    </table></div>
    <p class="fantasy-provenance">${esc(odds.source || "")} — snapshot ${esc(fetched)} AEST. Odds are about the stage ahead only; they reveal nothing about results.</p>`;
}

function fantasyDayCard(d, stagesDoc) {
  const st = stagesDoc.stages.find(s => s.n === d.stage);
  const type = st ? st.type : d.type;
  const picks = (d.picks || []).map(p => `
    <li class="fpick">
      <span class="fp-rider">${esc(p.rider)}</span>
      <span class="fp-team">${esc(p.team || "")}</span>
      <span class="fp-why">${esc(p.why || "")}</span>
    </li>`).join("");
  return `<div class="card fantasy-day">
    <div class="stage-topline">
      <span class="fd-num">Stage ${d.stage}</span>
      <span class="badge ${esc(type)}">${TYPE_LABELS[type] || esc(type)}</span>
      <span class="stage-date">${st ? fmtDate(st.date) : ""}</span>
    </div>
    ${st ? `<div class="fd-route">${esc(st.start)} → ${esc(st.finish)} · ${st.km} km · ${st.elevationM.toLocaleString()} m</div>` : ""}
    <div class="fd-headline">${esc(d.headline || "")}</div>
    <div class="fd-ridertype">🎯 Pick: <strong>${esc(d.riderType || "")}</strong></div>
    ${picks ? `<ul class="fpicks">${picks}</ul>` : ""}
  </div>`;
}

function renderFantasy(f, stagesDoc) {
  const dayCards = f.days.map(d => fantasyDayCard(d, stagesDoc)).join("");

  return `<h2 class="section">Fantasy Picks <em>next ${f.days.length} stages</em></h2>
    <p class="fantasy-provenance">${
      f.formThroughStage > 0
        ? `Form analysis uses results up to <strong>Stage ${f.formThroughStage}</strong> only — nothing newer is revealed here.`
        : `Based on pre-race form and the route — the race hadn't started when this was written.`
    }</p>
    ${dayCards}
    ${f.strategy ? `<div class="card fantasy-strategy"><div class="fs-label">💡 Window strategy</div>${esc(f.strategy)}</div>` : ""}`;
}

function jerseyCard(cls, label, holder) {
  const rider = holder && holder.rider ? esc(holder.rider) : "—";
  const team = holder && holder.team ? esc(holder.team) : "";
  return `<div class="jersey ${cls}">
    <div class="jname">${label}</div>
    <div class="rider">${rider}</div>
    <div class="team">${team}</div>
  </div>`;
}

async function loadWeather(stage) {
  const el = document.getElementById("weather");
  try {
    const lat = Number(stage.finishLat), lon = Number(stage.finishLon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("no finish coordinates");
    const url = "https://api.open-meteo.com/v1/forecast"
      + `?latitude=${lat}&longitude=${lon}`
      + "&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_gusts_10m,weather_code"
      + "&timezone=Europe%2FParis&past_days=2&forecast_days=16";
    const res = await fetch(url);
    const wx = await res.json();

    // Race window: 12:00–18:00 local (Europe/Paris) on the stage date.
    const hours = [12, 13, 14, 15, 16, 17, 18];
    const idx = hours
      .map(h => wx.hourly.time.indexOf(`${stage.date}T${pad2(h)}:00`))
      .filter(i => i >= 0);
    if (!idx.length) {
      const todayParis = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Paris" });
      el.innerHTML = stage.date < todayParis
        ? `<span class="weather-fail">This stage has already run — nothing to forecast.</span>`
        : `<span class="weather-fail">📅 Forecast opens about 16 days before the stage — check back closer to ${esc(fmtDate(stage.date))}.</span>`;
      return;
    }

    const mid = idx[Math.floor(idx.length / 2)];
    const [icon, desc] = WMO[wx.hourly.weather_code[mid]] || ["🌡️", "—"];
    const temps = idx.map(i => wx.hourly.temperature_2m[i]);

    el.innerHTML = `
      <div class="weather-now">
        <span class="icon">${icon}</span>
        <span>
          <span class="temp">${Math.round(Math.min(...temps))}–${Math.round(Math.max(...temps))}°C</span>
          <span class="desc"> ${desc} at the finish</span>
        </span>
      </div>
      <div class="weather-hours">
        ${idx.map(i => {
          const h = wx.hourly.time[i].slice(11, 16);
          const [ic] = WMO[wx.hourly.weather_code[i]] || ["🌡️"];
          return `<div class="whour">
            <div class="h">${h}</div>
            <div class="t">${ic} ${Math.round(wx.hourly.temperature_2m[i])}°</div>
            <div class="p">💧 ${wx.hourly.precipitation_probability[i] ?? 0}%</div>
            <div class="w">💨 ${Math.round(wx.hourly.wind_speed_10m[i])} km/h</div>
          </div>`;
        }).join("")}
      </div>
      <p class="weather-note">Race-window forecast (12:00–18:00 CEST) for ${esc(stage.finish)} on ${fmtDate(stage.date)} — Open-Meteo.</p>`;
  } catch (e) {
    el.innerHTML = `<span class="weather-fail">Weather unavailable (${esc(e.message)}).</span>`;
  }
}

main();
