// ============================================================
// PlanningModule: zakładka „Planowanie” (etap 1, tylko podgląd).
// Tydzień: audyty, zajętość z czterech skrzynek (Graph getSchedule), tygodnie opieki, dojazd z baz, terminy jednostek.
// Jedyny zapis: reguły planowania w liście PlanningRules (na podglądzie i lokalnie PlanningRules_TEST).
// Logika w planning.js (PlanningCore), tu tylko dane i widok.
// ============================================================
const PlanningModule = (function () {
  const P = PlanningCore;
  const $ = id => document.getElementById(id);
  const GEO_KEY = "planGeoCache_v1";
  const DAYS = ["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Nd"];
  let inited = false, monday = null, rules = P.parseRules([]), ruleItems = {}, rulesState = "";
  let busyByDay = {}, busyState = "", geo = {}, geoQueue = [], geoBusy = false;

  const todayISO = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const dmy = s => s.slice(8, 10) + "." + s.slice(5, 7);
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s == null ? "" : s));

  // ── geokodowanie adresów (Nominatim, kolejka 1 zapytanie na 1,1 s, pamięć w przeglądarce) ──
  try { geo = JSON.parse(localStorage.getItem(GEO_KEY) || "{}"); } catch { geo = {}; }
  const norm = s => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
  function coordsOf(s) { const m = String(s || "").match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/); return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null; }
  function pointOf(text, city) {
    const c = coordsOf(text); if (c) return c;
    const k = norm(text); if (k && geo[k]) return geo[k];
    if (k && !(k in geo)) enqueue(text, city);
    if (city) { try { const old = JSON.parse(localStorage.getItem("auditGeoCache_v1") || "{}")[norm(city)]; if (old) return { lat: old.lat, lon: old.lon, approx: true }; } catch {} }
    return null;
  }
  function enqueue(text, city) { if (!geoQueue.some(q => q.text === text)) geoQueue.push({ text, city }); if (!geoBusy) pump(); }
  async function pump() {
    geoBusy = true;
    while (geoQueue.length) {
      const { text, city } = geoQueue.shift(); const k = norm(text);
      if (k in geo) continue;
      let hit = null;
      for (const q of [text, city].filter(Boolean)) {
        try {
          const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=pl&q=" + encodeURIComponent(q));
          const j = r.ok ? await r.json() : [];
          if (j && j[0]) { hit = { lat: Number(j[0].lat), lon: Number(j[0].lon), approx: q !== text }; break; }
        } catch {}
        await new Promise(res => setTimeout(res, 1100));
      }
      geo[k] = hit; try { localStorage.setItem(GEO_KEY, JSON.stringify(geo)); } catch {}
      await new Promise(res => setTimeout(res, 1100));
      renderWeek();
    }
    geoBusy = false;
  }

  // ── reguły ──
  async function loadRules() {
    try {
      await ensurePlanningRulesList();
      const items = await fetchPlanningRules();
      ruleItems = {}; items.forEach(it => { ruleItems[it.Title] = it; });
      rules = P.parseRules(items.map(it => ({ Title: it.Title, Value: it.RuleValue })));
      rulesState = "";
    } catch (e) { rules = P.parseRules([]); rulesState = "Nie udało się wczytać reguł z SharePoint, używam wartości startowych (" + e.message + ")"; }
  }
  const bases = () => [
    { name: "Warszawa", text: rules.baza_warszawa },
    { name: "Trzemeszno", text: rules.baza_trzemeszno },
  ].map(b => ({ name: b.name, point: pointOf(b.text, b.name) }));

  // ── zajętość: cztery skrzynki przez getSchedule ──
  function mailboxes() {
    const fromRule = String(rules.skrzynki_zajetosc || "").split(/[,;\s]+/).filter(x => x.includes("@"));
    if (fromRule.length) return fromRule.map(a => ({ address: a, name: a.split("@")[0] + " · " + a.split("@")[1].split(".")[0] }));
    return (typeof INVITE_ATTENDEES !== "undefined" ? INVITE_ATTENDEES : []).slice();
  }
  async function loadBusy() {
    busyByDay = {}; busyState = "";
    const boxes = mailboxes(); if (!boxes.length) { busyState = "Brak skrzynek do sprawdzenia"; return; }
    let token; try { token = await getGraphToken(); } catch { token = null; }
    if (!token) { busyState = "Brak dostępu do kalendarzy (zaloguj się ponownie)"; return; }
    const end = P.addDays(monday, 7);
    try {
      const r = await fetch("https://graph.microsoft.com/v1.0/me/calendar/getSchedule", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json", Prefer: 'outlook.timezone="Europe/Warsaw"' },
        body: JSON.stringify({ schedules: boxes.map(b => b.address), startTime: { dateTime: monday + "T00:00:00", timeZone: "Europe/Warsaw" }, endTime: { dateTime: end + "T00:00:00", timeZone: "Europe/Warsaw" }, availabilityViewInterval: 60 }),
      });
      if (!r.ok) { busyState = "Kalendarze: błąd " + r.status; return; }
      const j = await r.json(); const problems = [];
      (j.value || []).forEach(s => {
        const box = boxes.find(b => b.address.toLowerCase() === String(s.scheduleId).toLowerCase());
        const label = box ? box.name : s.scheduleId;
        if (s.error) { problems.push(label + ": " + (s.error.message || s.error.responseCode || "brak dostępu")); return; }
        (s.scheduleItems || []).forEach(it => {
          if (!it || it.status === "free" || it.status === "workingElsewhere") return;
          if (/Audyt LFA CRM|^\s*📅\s*Audyt/.test(it.subject || "")) return;   // nasze zaproszenia (nowy i stary format): audyt jest już w widoku
          splitDays(it, label);
        });
      });
      busyState = problems.length ? "Nie wszystkie kalendarze: " + problems.join("; ") : "";
    } catch (e) { busyState = "Kalendarze: " + e.message; }
  }
  function splitDays(it, label) {
    const s = String(it.start && it.start.dateTime || ""), e = String(it.end && it.end.dateTime || "");
    if (!s || !e) return;
    let d = s.slice(0, 10); const lastD = e.slice(0, 10);
    for (let guard = 0; guard < 14 && d <= lastD; guard++, d = P.addDays(d, 1)) {
      const st = d === s.slice(0, 10) ? s.slice(11, 16) : "00:00";
      const en = d === lastD ? e.slice(11, 16) : "24:00";
      if (d === lastD && en === "00:00" && d !== s.slice(0, 10)) break;
      (busyByDay[d] = busyByDay[d] || []).push({ start: st, end: en, label: label + (it.subject ? ", " + it.subject : "") + (it.status === "tentative" ? " (wstępnie)" : it.status === "oof" ? " (poza biurem)" : "") });
    }
  }

  // ── audyty tygodnia ──
  function weekItems() {
    const list = (typeof allAudits !== "undefined" ? allAudits : []).filter(a =>
      (typeof MY_AUDITOR === "undefined" || a.AuditorName === MY_AUDITOR) && a.AuditStatus !== "REJECTED" && a.AuditDateStart);
    const out = [];
    for (let i = 0; i < 7; i++) {
      const k = P.addDays(monday, i);
      list.forEach(a => {
        if (!auditCoversDay(a, k)) return;
        const text = siteText(a), city = a.SiteCity || a.City;
        const meeting = /spotkan|szkoleni/i.test((a.AuditType || "") + " " + (a.Program || ""));
        out.push({ id: a.Id, audit: a, date: k, start: a.StartTime || "", end: a.EndTime || (a.StartTime ? addHours(a.StartTime, DEFAULT_AUDIT_HOURS) : ""),
          body: certBodyOf(a) === "SGS" ? "SGS" : "CU", scheme: a.Program || "", meeting, planSent: a.PlanSentDate || "", done: a.AuditStatus === "DONE", title: a.Title || "", place: text, point: text ? pointOf(text, city) : null });
      });
    }
    return out;
  }
  function travelOf(x) {
    if (!x.point) return null;
    const t = P.bestBase(x.point, bases(), (a, b) => P.estimateDrive(a, b, rules));
    if (t && x.point.approx) t.source = "szacunek do miasta";
    return t;
  }
  // Zajętość, która jest naszym własnym audytem (zaproszenie w innej skrzynce bez tematu): pomijamy, gdy pasuje co do minuty
  function busyFor(items) {
    const out = {};
    Object.keys(busyByDay).forEach(d => {
      out[d] = busyByDay[d].filter(b => !items.some(x => x.date === d && x.start === b.start && x.end === b.end));
    });
    return out;
  }

  // ── widok ──
  function findingHtml(f) {
    if (f.level === "block") return `<div class="lfa-alert" data-kind="danger"><strong>Blokada:</strong>&nbsp;${esc(f.text)}</div>`;
    if (f.level === "warn") return `<div class="lfa-alert" data-kind="warning"><strong>Uwaga:</strong>&nbsp;${esc(f.text)}</div>`;
    return `<li>${esc(f.text)}</li>`;
  }
  function renderWeek() {
    const box = $("plan-week"); if (!box || !monday) return;
    const items = weekItems();
    const wk = P.buildWeek(monday, items, busyFor(items), d => { try { return OpiekaModule.dayInfo(d).father; } catch { return false; } }, travelOf, rules, todayISO());
    $("plan-title").textContent = `Tydzień ${wk.week} · ${dmy(monday)}–${dmy(P.addDays(monday, 6))}.${P.addDays(monday, 6).slice(0, 4)}`;
    const notes = [rulesState, busyState, geoQueue.length || geoBusy ? "Szukam współrzędnych adresów, odległości uzupełnią się same" : ""].filter(Boolean);
    $("plan-status").innerHTML = notes.map(n => `<div class="lfa-alert" data-kind="warning">${esc(n)}</div>`).join("");
    const today = todayISO();
    box.innerHTML = wk.days.map(d => {
      const tags = [d.custody ? "👨‍👦 Opieka" : "", d.weekday === 5 ? "Sobota" : "", d.weekday === 6 ? "Niedziela" : "", d.date === today ? "Dziś" : ""].filter(Boolean);
      const busy = d.busy.map(b => `<div class="lfa-cal-chip" data-kind="ext"><span class="lfa-data">${esc(b.start)}–${esc(b.end)}</span> Zajęte: ${esc(b.label)}</div>`).join("");
      const audits = d.items.map(x => {
        const it = x.item, t = x.travel;
        const blocks = x.findings.filter(f => f.level !== "info").map(findingHtml).join("");
        const infos = x.findings.filter(f => f.level === "info").map(findingHtml).join("");
        const travel = t ? `<div class="plan-travel">🚗 Z bazy ${esc(t.base)}: <span class="lfa-data">ok. ${t.km} km, ${esc(P.fmtDur(t.min))}</span> <span class="lfa-muted">(${esc(t.source)})</span></div>`
                         : `<div class="plan-travel lfa-muted">🚗 ${it.place ? "Liczę dojazd…" : "Brak adresu miejsca audytu"}</div>`;
        return `<article class="plan-item">
          <div class="lfa-cal-chip" data-body="${it.body === "SGS" ? "sgs" : "cu"}"><span class="lfa-data">${esc(it.start ? it.start + (it.end ? "–" + it.end : "") : "bez godziny")}</span> ${esc(it.meeting ? "Spotkanie" : it.body)} · ${esc(it.scheme)}</div>
          <div class="plan-item-title">${esc(it.title)}</div>
          ${it.place ? `<div class="lfa-muted">${esc(it.place)}</div>` : ""}
          ${travel}${blocks}${infos ? `<ul class="plan-infos">${infos}</ul>` : ""}
        </article>`;
      }).join("");
      const empty = !d.items.length && !d.busy.length ? `<div class="lfa-muted">Wolny</div>` : "";
      return `<section class="lfa-card plan-day${d.date === today ? " is-today" : ""}">
        <div class="lfa-card-header"><span><span class="lfa-data">${DAYS[d.weekday]} ${dmy(d.date)}</span></span><span class="lfa-muted">${esc(tags.join(" · "))}</span></div>
        <div class="lfa-card-body">${busy}${audits}${empty}</div>
      </section>`;
    }).join("");
  }
  async function refresh() {
    $("plan-week").innerHTML = `<div class="lfa-muted">Wczytuję kalendarze…</div>`;
    await loadBusy(); renderWeek();
  }
  function go(deltaWeeks) { monday = deltaWeeks === 0 ? P.mondayOf(todayISO()) : P.addDays(monday, 7 * deltaWeeks); refresh(); }

  // ── edytor reguł ──
  function openRules() {
    $("plan-rules-body").innerHTML = `<div class="lfa-table-wrap"><table class="lfa-table"><thead><tr><th>Reguła</th><th>Wartość</th></tr></thead><tbody>` +
      P.DEFAULT_RULES.map(r => {
        const v = rules[r.key]; const id = "pr-" + r.key;
        const input = r.type === "bool"
          ? `<select class="lfa-select" id="${id}" aria-label="${esc(r.desc)}"><option value="tak"${v ? " selected" : ""}>tak</option><option value="nie"${!v ? " selected" : ""}>nie</option></select>`
          : `<input class="lfa-input${r.type === "text" ? "" : " data"}" id="${id}" aria-label="${esc(r.desc)}" value="${esc(v)}" ${r.type === "number" ? 'inputmode="decimal"' : ""}>`;
        return `<tr><td><label class="lfa-label" for="${id}">${esc(r.desc)}</label><div class="lfa-muted lfa-data">${esc(r.key)}</div></td><td>${input}</td></tr>`;
      }).join("") + `</tbody></table></div>`;
    $("plan-rules-overlay").classList.remove("hidden");
  }
  function closeRules() { $("plan-rules-overlay").classList.add("hidden"); }
  async function saveRules() {
    const btn = $("plan-rules-save"); btn.disabled = true;
    let changed = 0;
    try {
      for (const r of P.DEFAULT_RULES) {
        const el = $("pr-" + r.key); if (!el) continue;
        const raw = el.value.trim(), cur = rules[r.key];
        const curText = r.type === "bool" ? (cur ? "tak" : "nie") : String(cur);
        if (raw === curText) continue;
        if (P.coerce(r.type, raw) == null && raw !== "") { showToast("Błędna wartość: " + r.desc, "error"); btn.disabled = false; return; }
        const it = ruleItems[r.key];
        await savePlanningRule(it && it.Id, r.key, raw, r.desc); changed++;
      }
      await loadRules(); closeRules(); renderWeek();
      showToast(changed ? "✓ Zapisano reguły: " + changed : "Bez zmian", "success");
    } catch (e) { showToast("Nie zapisano reguł: " + e.message, "error"); }
    btn.disabled = false;
  }

  function setup() {
    $("plan-prev").addEventListener("click", () => go(-1));
    $("plan-next").addEventListener("click", () => go(1));
    $("plan-today").addEventListener("click", () => go(0));
    $("plan-rules-btn").addEventListener("click", openRules);
    $("plan-rules-close").addEventListener("click", closeRules);
    $("plan-rules-cancel").addEventListener("click", closeRules);
    $("plan-rules-save").addEventListener("click", saveRules);
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("plan-rules-overlay").classList.contains("hidden")) closeRules(); });
  }
  async function render() {
    if (!inited) { setup(); inited = true; monday = P.mondayOf(todayISO()); await loadRules(); }
    refresh();
  }
  return { render };
})();
window.PlanningModule = PlanningModule;
