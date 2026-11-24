// ============================================================
// PlanningCore: czysta logika planowania (bez DOM i bez sieci), testowana w tests/planning.test.js.
// Reguły pochodzą z listy SharePoint PlanningRules; tu są tylko wartości startowe i typy.
// Etap 1: wyłącznie podgląd. Nic tutaj nie zapisuje audytów ani kalendarzy.
// ============================================================
var PlanningCore = (function () {
  // Wartości startowe. Właściciel zmienia je w aplikacji (lista PlanningRules), nie w kodzie.
  var DEFAULT_RULES = [
    { key: "baza_warszawa",              type: "text",   value: "Warszawa",       desc: "Adres bazy w Warszawie" },
    { key: "baza_trzemeszno",            type: "text",   value: "Trzemeszno",     desc: "Adres bazy w Trzemesznie" },
    { key: "dojazd_max_min",             type: "number", value: 150,              desc: "Maksymalny dojazd w jedną stronę (minuty)" },
    { key: "dojazd_max_km",              type: "number", value: 300,              desc: "Maksymalny dojazd w jedną stronę (km)" },
    { key: "start_min",                  type: "time",   value: "08:30",          desc: "Najwcześniejszy start audytu" },
    { key: "bufor_przed_min",            type: "number", value: 15,               desc: "Bufor przed audytem (minuty)" },
    { key: "nocleg_od_km",               type: "number", value: 300,              desc: "Nocleg dopiero powyżej (km w jedną stronę)" },
    { key: "opieka_bez_noclegu",         type: "bool",   value: true,             desc: "W tygodniu opieki powrót tego samego dnia" },
    { key: "opieka_preferuj_przeniesienie", type: "bool", value: true,            desc: "W tygodniu opieki najpierw szukaj innego tygodnia" },
    { key: "raport_dni_CU",              type: "number", value: 14,               desc: "Termin raportu CU (dni od audytu)" },
    { key: "raport_dni_SGS",             type: "number", value: 7,                desc: "Termin raportu SGS (dni od audytu)" },
    { key: "plan_wysylka_dni_KZR_SURE",  type: "number", value: 7,                desc: "Wysyłka planu KZR INiG i SURE (dni przed audytem)" },
    { key: "plan_wysylka_dni_FSC_PEFC",  type: "number", value: 14,               desc: "Wysyłka planu FSC i PEFC (dni przed audytem)" },
    { key: "plan_wysylka_min_FSC_PEFC",  type: "number", value: 7,                desc: "Wysyłka planu FSC i PEFC, minimum (dni)" },
    { key: "SGS_dokumentacja_dni",       type: "number", value: 7,                desc: "Dokumentacja SGS najlepiej (dni przed audytem)" },
    { key: "sobota_dozwolona",           type: "bool",   value: false,            desc: "Sobota jako zwykły dzień (domyślnie tylko wyjątek)" },
    { key: "audyty_dziennie_max",        type: "number", value: 2,                desc: "Audyty jednego dnia (tylko klienci blisko siebie)" },
    { key: "drugi_audyt_max_km",         type: "number", value: 60,               desc: "Drugi audyt tego dnia: maksymalna odległość między klientami (km)" },
    { key: "srednia_predkosc_kmh",       type: "number", value: 75,               desc: "Średnia prędkość do szacunku bez usługi map (km/h)" },
    { key: "wspolczynnik_drogi",         type: "number", value: 1.3,              desc: "Droga względem linii prostej do szacunku" },
    { key: "skrzynki_zajetosc",          type: "text",   value: "",               desc: "Skrzynki liczone jako zajęte (adresy po przecinku)" },
  ];

  function coerce(type, raw) {
    if (raw == null || raw === "") return null;
    if (type === "number") { var n = Number(String(raw).replace(",", ".")); return isFinite(n) ? n : null; }
    if (type === "bool") { var s = String(raw).trim().toLowerCase(); return s === "tak" || s === "true" || s === "1" || s === "yes"; }
    if (type === "time") { var m = String(raw).match(/^(\d{1,2}):(\d{2})$/); return m ? m[1].padStart(2, "0") + ":" + m[2] : null; }
    return String(raw);
  }

  // items: [{Title: klucz, Value: tekst}] z SharePoint → obiekt reguł z wartościami startowymi dla braków
  function parseRules(items) {
    var out = {}, byKey = {};
    (items || []).forEach(function (it) { if (it && it.Title) byKey[String(it.Title).trim()] = it.Value; });
    DEFAULT_RULES.forEach(function (r) {
      var v = byKey.hasOwnProperty(r.key) ? coerce(r.type, byKey[r.key]) : null;
      out[r.key] = v == null ? r.value : v;
    });
    return out;
  }

  // ── czas i daty (ISO yyyy-mm-dd, lokalnie, bez stref) ──
  function toMin(hhmm) { var m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; }
  function fromMin(t) { t = ((Math.round(t) % 1440) + 1440) % 1440; return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); }
  function parseISO(s) { var m = String(s || "").match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null; }
  function iso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function addDays(s, n) { var d = parseISO(s); d.setDate(d.getDate() + n); return iso(d); }
  function weekday(s) { return (parseISO(s).getDay() + 6) % 7; }            // 0 = poniedziałek … 6 = niedziela
  function mondayOf(s) { return addDays(s, -weekday(s)); }
  function isoWeek(s) {
    var d = parseISO(s); d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
    var w1 = new Date(d.getFullYear(), 0, 4);
    return 1 + Math.round(((d - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
  }

  // ── odległości ──
  function haversineKm(a, b) {
    if (!a || !b) return null;
    var R = 6371, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  // Szacunek bez usługi map: linia prosta × współczynnik drogi, średnia prędkość
  function estimateDrive(a, b, rules) {
    var km = haversineKm(a, b); if (km == null) return null;
    var road = km * (rules.wspolczynnik_drogi || 1.3);
    return { km: Math.round(road), min: Math.round(road / (rules.srednia_predkosc_kmh || 75) * 60), source: "szacunek" };
  }
  function cacheKey(a, b) { var f = function (p) { return p.lat.toFixed(3) + "," + p.lon.toFixed(3); }; return f(a) + "|" + f(b); }

  // Najbliższa baza: bases = [{name, point}], drive(point, site) → {km, min, source}
  function bestBase(site, bases, drive) {
    var best = null;
    (bases || []).forEach(function (b) {
      if (!b.point || !site) return;
      var d = drive(b.point, site); if (!d) return;
      if (!best || d.min < best.min) best = { base: b.name, km: d.km, min: d.min, source: d.source };
    });
    return best;
  }

  // ── terminy jednostek ──
  function schemeGroup(scheme) {
    var s = String(scheme || "").toUpperCase();
    if (/KZR|SURE/.test(s)) return "KZR_SURE";
    if (/FSC|PEFC/.test(s)) return "FSC_PEFC";
    return "";
  }
  function deadlines(date, body, scheme, rules) {
    var out = {};
    var rep = body === "SGS" ? rules.raport_dni_SGS : rules.raport_dni_CU;
    out.report = addDays(date, rep);
    var g = schemeGroup(scheme);
    if (g === "KZR_SURE") out.planSend = addDays(date, -rules.plan_wysylka_dni_KZR_SURE);
    if (g === "FSC_PEFC") { out.planSend = addDays(date, -rules.plan_wysylka_dni_FSC_PEFC); out.planSendMin = addDays(date, -rules.plan_wysylka_min_FSC_PEFC); }
    if (body === "SGS") out.sgsDocs = addDays(date, -rules.SGS_dokumentacja_dni);
    return out;
  }

  // ── ocena jednego audytu w dniu ──
  // ctx: { date, start, end, body, scheme, travel {km,min,base}, custody (bool), busy [{start,end,label}], sameDay [{point}], point, today }
  // wynik: [{level: "block"|"warn"|"info", code, text}]
  function checkAudit(ctx, rules) {
    var f = [], add = function (level, code, text) { f.push({ level: level, code: code, text: text }); };
    var wd = weekday(ctx.date);
    if (wd === 6) add("block", "niedziela", "Niedziela. Audyt w niedzielę nie jest planowany");
    else if (wd === 5 && !rules.sobota_dozwolona) add("warn", "sobota", "Sobota. Tylko jako wyjątek");

    var t = ctx.travel;
    if (t) {
      if (t.min > rules.dojazd_max_min || t.km > rules.dojazd_max_km)
        add("warn", "dojazd", "Dojazd ponad limit: " + t.km + " km, " + fmtDur(t.min) + " (limit " + rules.dojazd_max_km + " km, " + fmtDur(rules.dojazd_max_min) + ")");
      if (t.km > rules.nocleg_od_km) {
        if (ctx.custody && rules.opieka_bez_noclegu)
          add("block", "opieka_nocleg", "Tydzień opieki: nocleg niemożliwy przy " + t.km + " km. " + (rules.opieka_preferuj_przeniesienie ? "Przenieś audyt na inny tydzień" : "Powrót tego samego dnia"));
        else add("info", "nocleg", "Nocleg potrzebny (" + t.km + " km w jedną stronę)");
      }
    }

    var s = toMin(ctx.start), e = toMin(ctx.end);
    if (s != null && s < toMin(rules.start_min)) add("warn", "start", "Start " + ctx.start + " przed " + rules.start_min);
    if (s != null && t) add("info", "wyjazd", "Wyjazd z bazy " + t.base + " o " + fromMin(s - t.min - rules.bufor_przed_min));

    if (s != null && (ctx.busy || []).length) {
      var ee = e != null ? e : s + 8 * 60;
      (ctx.busy || []).forEach(function (b) {
        var bs = toMin(b.start), be = toMin(b.end);
        if (bs != null && be != null && bs < ee && be > s - (t ? t.min : 0)) add("warn", "kolizja", "Kolizja z kalendarzem: " + b.start + "–" + b.end + (b.label ? " (" + b.label + ")" : ""));
      });
    }

    var n = (ctx.sameDay || []).length + 1;
    if (n > rules.audyty_dziennie_max) add("warn", "limit_dnia", n + " audyty tego dnia (limit " + rules.audyty_dziennie_max + ")");
    else if (n > 1 && ctx.point) {
      (ctx.sameDay || []).forEach(function (o) {
        var km = haversineKm(ctx.point, o.point);
        if (km != null && km * (rules.wspolczynnik_drogi || 1.3) > rules.drugi_audyt_max_km) add("warn", "drugi_daleko", "Drugi audyt tego dnia daleko: około " + Math.round(km * (rules.wspolczynnik_drogi || 1.3)) + " km");
      });
    }

    if (ctx.meeting) return f;                              // spotkanie lub szkolenie: bez terminów jednostki
    var d = deadlines(ctx.date, ctx.body, ctx.scheme, rules), today = ctx.today || "";
    add("info", "raport", "Raport do " + d.report + " (" + (ctx.body || "CU") + ")");
    if (today && ctx.date < today) return f;                // audyt w przeszłości: terminy przed audytem już nieistotne
    if (ctx.done) return f;                                 // audyt wykonany
    if (ctx.planSent) add("info", "plan_wyslany", "✓ Plan audytu wysłany " + String(ctx.planSent).slice(0, 10));
    else if (d.planSend) {
      if (today && today > (d.planSendMin || d.planSend)) add("warn", "plan_po_terminie", "Plan audytu: termin wysyłki minął (" + (d.planSendMin || d.planSend) + ")");
      else add("info", "plan_wysylka", "Plan audytu wyślij do " + d.planSend + (d.planSendMin ? " (minimum " + d.planSendMin + ")" : ""));
    }
    if (d.sgsDocs) add("info", "sgs_dokumentacja", "Dokumentacja SGS najlepiej do " + d.sgsDocs);
    return f;
  }
  function fmtDur(min) { var h = Math.floor(min / 60), m = min % 60; return h + " h" + (m ? " " + m + " min" : ""); }

  // ── tydzień ──
  // items: [{id, date, start, end, body, scheme, point, title}] (już przefiltrowane do tygodnia lub szerzej)
  // busyByDay: { "yyyy-mm-dd": [{start,end,label}] }, custodyOf(date) → bool, travelOf(item) → {km,min,base}|null
  function buildWeek(monday, items, busyByDay, custodyOf, travelOf, rules, today) {
    var days = [];
    for (var i = 0; i < 7; i++) {
      var date = addDays(monday, i);
      var dayItems = (items || []).filter(function (x) { return x.date === date; })
        .sort(function (a, b) { return (toMin(a.start) || 0) - (toMin(b.start) || 0); });
      var busy = (busyByDay && busyByDay[date]) || [];
      var custody = !!(custodyOf && custodyOf(date));
      days.push({
        date: date, weekday: i, custody: custody, busy: busy,
        items: dayItems.map(function (x) {
          var travel = travelOf ? travelOf(x) : null;
          var others = dayItems.filter(function (o) { return o !== x; });
          return { item: x, travel: travel, findings: checkAudit({
            date: date, start: x.start, end: x.end, body: x.body, scheme: x.scheme, travel: travel, meeting: x.meeting, planSent: x.planSent, done: x.done,
            custody: custody, busy: busy, sameDay: others, point: x.point, today: today,
          }, rules) };
        }),
      });
    }
    return { monday: monday, week: isoWeek(monday), days: days };
  }

  return {
    DEFAULT_RULES: DEFAULT_RULES, parseRules: parseRules, coerce: coerce,
    toMin: toMin, fromMin: fromMin, addDays: addDays, weekday: weekday, mondayOf: mondayOf, isoWeek: isoWeek,
    haversineKm: haversineKm, estimateDrive: estimateDrive, cacheKey: cacheKey, bestBase: bestBase,
    schemeGroup: schemeGroup, deadlines: deadlines, checkAudit: checkAudit, buildWeek: buildWeek, fmtDur: fmtDur,
  };
})();
if (typeof window !== "undefined") window.PlanningCore = PlanningCore;
