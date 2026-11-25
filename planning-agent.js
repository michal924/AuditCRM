// ============================================================
// PlanningAgent: rozmowa z agentem planowania (etap 2b).
// Pętla narzędzi działa w przeglądarce: serwer (/api/agent) woła model, a narzędzia liczą dane tutaj,
// na danych zalogowanego właściciela. Przed wysłaniem nazwy klientów zamieniane są na pseudonimy KL-...
// Agent niczego nie zapisuje. Propozycja zmiany to karta z przyciskiem do karty audytu.
// ============================================================
const PlanningAgent = (function () {
  const $ = id => document.getElementById(id);
  const esc = s => (typeof escHtml === "function" ? escHtml(s) : String(s == null ? "" : s));
  const MAX_STEPS = 12;
  let messages = [], busy = false;

  // ── pseudonimy ──
  const byPseudo = {}, byName = {};
  let seq = 0;
  const LEGAL = /\b(sp\.?\s*z\s*o\.?\s*o\.?|spółka|spolka|z ograniczoną|z ograniczona|odpowiedzialnością|odpowiedzialnoscia|komandytowa|akcyjna|s\.?\s*a\.?|sp\.?\s*k\.?|sp\.?\s*j\.?|p\.?\s*h\.?\s*u\.?)\b/gi;
  const core = t => String(t || "").replace(LEGAL, " ").replace(/[„”"]/g, " ").replace(/\s+/g, " ").trim();
  function pseudoOf(a) {
    const name = String(a.Title || "").trim();
    let c = null; try { c = window.ClientsModule && ClientsModule.clientOfAudit(a); } catch {}
    const key = c ? "id:" + c.Id : "t:" + name.toLowerCase();
    if (byName[key]) return byName[key];
    const p = c ? "KL-" + String(c.Id).padStart(4, "0") : "KL-T" + String(++seq).padStart(3, "0");
    byName[key] = p; byPseudo[p] = c ? c.Title : name;
    return p;
  }
  function primeNames() { (typeof allAudits !== "undefined" ? allAudits : []).forEach(a => { if (a.Title) pseudoOf(a); }); }
  // tekst właściciela → pseudonimy (pełna nazwa albo nazwa bez formy prawnej)
  function anonymize(text) {
    primeNames();
    const pairs = [];
    Object.keys(byPseudo).forEach(p => { const n = byPseudo[p]; [n, core(n)].forEach(v => { if (v && v.length >= 4) pairs.push([v, p]); }); });
    pairs.sort((x, y) => y[0].length - x[0].length);
    let out = text;
    pairs.forEach(([v, p]) => { out = out.replace(new RegExp(v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), p); });
    return out;
  }
  const deanonymize = text => String(text || "").replace(/KL-T?\d{3,4}/g, p => byPseudo[p] ? byPseudo[p] : p);

  // ── narzędzia ──
  const H = () => PlanningModule.agentApi();
  async function runTool(name, input) {
    const h = H();
    if (name === "pobierz_reguly") return h.rules();
    if (name === "pobierz_tydzien") {
      const w = await h.week(String(input.data || h.today()));
      return {
        tydzien: w.week, od: w.monday,
        dni: w.days.map(d => ({
          data: d.date, opieka: d.custody,
          zajete: d.busy.map(b => b.start + "-" + b.end + " (" + String(b.label || "").split(",")[0] + ")"),
          audyty: d.items.map(x => ({
            audyt: "A-" + x.item.id, klient: pseudoOf(x.item.audit), godziny: x.item.start ? x.item.start + "-" + x.item.end : "brak", jednostka: x.item.body,
            program: x.item.scheme, spotkanie: !!x.item.meeting, miasto: x.item.audit.SiteCity || x.item.audit.City || "",
            dojazd: x.travel ? { km: x.travel.km, min: x.travel.min, baza: x.travel.base, zrodlo: x.travel.source } : null,
            ustalenia: x.findings.map(f => f.level + ": " + f.text),
          })),
          raporty: (w.reports[d.date] || []).map(b => b.start + "-" + b.end + " raport " + b.body + " (termin " + b.deadline + ")"),
        })),
        braki_czasu_na_raport: w.short.length,
      };
    }
    if (name === "szukaj_audytow") {
      const od = String(input.od), doo = String(input.do), q = String(input.fraza || "").toLowerCase().trim();
      const seen = {}, out = [];
      h.itemsBetween(od, doo).forEach(x => {
        if (seen[x.id]) return;
        const a = x.audit, p = pseudoOf(a), city = a.SiteCity || a.City || "";
        if (q && ![p, city, x.scheme, x.body].some(v => String(v || "").toLowerCase().includes(q))) return;
        seen[x.id] = 1;
        out.push({ audyt: "A-" + x.id, klient: p, data: x.date, godziny: x.start || "brak", jednostka: x.body, program: x.scheme, miasto: city, status: a.AuditStatus });
      });
      return { liczba: out.length, audyty: out.slice(0, 60) };
    }
    if (name === "inne_terminy") {
      const id = Number(String(input.audyt || "").replace(/^A-/, ""));
      const r = await h.variants(id);
      if (!r) return { blad: "Nie znam audytu " + input.audyt };
      return { obecny_termin: r.date, warianty: r.variants.map(v => ({ data: v.date, uzasadnienie: v.reasons })) };
    }
    if (name === "zaproponuj_zmiane") {
      const id = Number(String(input.audyt || "").replace(/^A-/, ""));
      const a = (typeof allAudits !== "undefined" ? allAudits : []).find(x => x.Id === id);
      if (!a) return { blad: "Nie znam audytu " + input.audyt };
      addProposal(a, input);
      return { wynik: "Propozycja pokazana właścicielowi. Czeka na jego decyzję w karcie audytu." };
    }
    return { blad: "Nieznane narzędzie " + name };
  }
  const TOOL_LABEL = { pobierz_tydzien: "Sprawdzam tydzień", szukaj_audytow: "Szukam audytów", inne_terminy: "Liczę inne terminy", pobierz_reguly: "Czytam reguły", zaproponuj_zmiane: "Przygotowuję propozycję" };

  // ── widok rozmowy ──
  function log(html) { const box = $("plan-agent-log"); box.insertAdjacentHTML("beforeend", html); box.scrollTop = box.scrollHeight; }
  function addProposal(a, input) {
    const when = input.nowa_data.split("-").reverse().join(".") + (input.nowa_godzina ? " o " + input.nowa_godzina : "");
    log(`<div class="lfa-alert plan-agent-prop"><div><strong>Propozycja:</strong>&nbsp;${esc(a.Title)} na ${esc(when)}</div>
      <div class="lfa-muted">${esc(deanonymize(input.uzasadnienie))}</div>
      <div><button class="lfa-btn secondary sm" data-open-audit="${a.Id}">Otwórz kartę audytu</button></div></div>`);
  }
  function setBusy(v, label) {
    busy = v; $("plan-agent-send").disabled = v; $("plan-agent-input").disabled = v;
    $("plan-agent-state").textContent = v ? (label || "Myślę…") : "";
  }
  async function idToken() {
    const account = msalInstance.getAllAccounts()[0]; if (!account) throw new Error("Zaloguj się ponownie");
    let r = await msalInstance.acquireTokenSilent({ scopes: ["User.Read"], account });
    const exp = r.idTokenClaims && r.idTokenClaims.exp;
    if (!r.idToken || (exp && exp * 1000 < Date.now() + 120000)) r = await msalInstance.acquireTokenSilent({ scopes: ["User.Read"], account, forceRefresh: true });
    return r.idToken;
  }
  async function callModel() {
    const r = await fetch("/api/agent", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + await idToken() },
      body: JSON.stringify({ messages, today: H().today() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("błąd " + r.status));
    return j;
  }
  async function send() {
    const inp = $("plan-agent-input"), text = inp.value.trim();
    if (!text || busy) return;
    inp.value = "";
    log(`<div class="plan-agent-msg is-user"><span class="lfa-eyebrow">Ty</span><div>${esc(text)}</div></div>`);
    messages.push({ role: "user", content: anonymize(text) });
    setBusy(true);
    try {
      for (let step = 0; step < MAX_STEPS; step++) {
        const res = await callModel();
        messages.push({ role: "assistant", content: res.content });
        const said = (res.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
        if (said) log(`<div class="plan-agent-msg"><span class="lfa-eyebrow">Asystent</span>${deanonymize(said).split(/\n+/).map(p => `<p>${esc(p)}</p>`).join("")}</div>`);
        if (res.stop_reason === "pause_turn") continue;
        if (res.stop_reason !== "tool_use") break;
        const results = [];
        for (const b of res.content.filter(b => b.type === "tool_use")) {
          setBusy(true, (TOOL_LABEL[b.name] || "Sprawdzam") + "…");
          let out; try { out = await runTool(b.name, b.input || {}); } catch (e) { out = { blad: e.message }; }
          results.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(out) });
        }
        messages.push({ role: "user", content: results });
        if (step === MAX_STEPS - 1) log(`<div class="lfa-alert" data-kind="warning">Asystent przerwał po ${MAX_STEPS} krokach. Zadaj węższe pytanie.</div>`);
      }
    } catch (e) {
      log(`<div class="lfa-alert" data-kind="danger"><strong>Błąd:</strong>&nbsp;${esc(e.message)}</div>`);
      // ostatnia wiadomość bez odpowiedzi psuje kolejne pytania: wracamy do stanu sprzed pytania
      while (messages.length && !(messages[messages.length - 1].role === "assistant" && !(messages[messages.length - 1].content || []).some(b => b.type === "tool_use"))) messages.pop();
    }
    setBusy(false);
    inp.focus();
  }
  function reset() { messages = []; $("plan-agent-log").innerHTML = ""; $("plan-agent-input").focus(); }

  function setup() {
    if (!$("plan-agent-send")) return;
    $("plan-agent-send").addEventListener("click", send);
    $("plan-agent-reset").addEventListener("click", reset);
    $("plan-agent-input").addEventListener("keydown", e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); });
    $("plan-agent-log").addEventListener("click", e => {
      const b = e.target.closest("[data-open-audit]"); if (b && typeof openModal === "function") openModal(Number(b.dataset.openAudit));
    });
  }
  return { setup, anonymize, deanonymize, runTool };
})();
window.PlanningAgent = PlanningAgent;
