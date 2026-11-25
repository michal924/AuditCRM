// Testy PlanningCore (planning.js) na danych syntetycznych. Uruchamia je scripts/test.sh.
function runPlanningTests(P) {
  var fails = [], n = 0;
  function eq(name, got, exp) { n++; if (JSON.stringify(got) !== JSON.stringify(exp)) fails.push(name + ": oczekiwano " + JSON.stringify(exp) + ", jest " + JSON.stringify(got)); }
  function has(name, findings, code, yes) { n++; var f = findings.some(function (x) { return x.code === code; }); if (f !== (yes !== false)) fails.push(name + ": " + (yes !== false ? "brak" : "niepotrzebne") + " „" + code + "” w " + JSON.stringify(findings.map(function (x) { return x.code; }))); }

  var R = P.parseRules([]);
  var WAW = { lat: 52.23, lon: 21.01 }, TRZ = { lat: 52.56, lon: 17.82 }, MIELEC = { lat: 50.29, lon: 21.42 }, SZCZ = { lat: 53.43, lon: 14.55 }, NEAR = { lat: 52.25, lon: 21.30 };

  // reguły: wartości startowe, nadpisanie z SharePoint, błędna wartość wraca do startowej
  eq("reguła startowa", R.dojazd_max_km, 300);
  var R2 = P.parseRules([{ Title: "dojazd_max_km", Value: "250" }, { Title: "start_min", Value: "9:00" }, { Title: "opieka_bez_noclegu", Value: "nie" }, { Title: "raport_dni_CU", Value: "abc" }]);
  eq("nadpisanie liczby", R2.dojazd_max_km, 250);
  eq("nadpisanie godziny", R2.start_min, "09:00");
  eq("nadpisanie tak/nie", R2.opieka_bez_noclegu, false);
  eq("błędna liczba → startowa", R2.raport_dni_CU, 14);

  // daty
  eq("poniedziałek tygodnia", P.mondayOf("2026-11-26"), "2026-11-23");
  eq("tydzień ISO", P.isoWeek("2026-11-23"), 48);
  eq("tydzień ISO na przełomie roku", P.isoWeek("2027-01-01"), 53);
  eq("dodawanie dni przez miesiąc", P.addDays("2026-11-28", 7), "2026-12-05");

  // odległości
  var hk = Math.round(P.haversineKm(WAW, MIELEC));
  n++; if (hk < 210 || hk > 230) fails.push("haversine Warszawa–Mielec poza zakresem: " + hk);
  var best = P.bestBase(MIELEC, [{ name: "Warszawa", point: WAW }, { name: "Trzemeszno", point: TRZ }], function (a, b) { return P.estimateDrive(a, b, R); });
  eq("najbliższa baza", best.base, "Warszawa");
  eq("klucz pamięci odległości", P.cacheKey(WAW, MIELEC), "52.230,21.010|50.290,21.420");

  // terminy
  eq("raport CU 14 dni", P.deadlines("2026-12-01", "CU", "FSC", R).report, "2026-12-15");
  eq("raport SGS 7 dni", P.deadlines("2026-12-01", "SGS", "KZR INiG", R).report, "2026-12-08");
  eq("plan KZR 7 dni przed", P.deadlines("2026-12-10", "CU", "KZR INiG", R).planSend, "2026-12-03");
  eq("plan FSC 14 dni przed", P.deadlines("2026-12-15", "CU", "FSC CoC", R).planSend, "2026-12-01");
  eq("dokumentacja SGS 7 dni przed", P.deadlines("2026-12-10", "SGS", "KZR INiG", R).sgsDocs, "2026-12-03");

  // ocena audytu
  var tFar = P.bestBase(SZCZ, [{ name: "Warszawa", point: WAW }], function (a, b) { return P.estimateDrive(a, b, R); });
  var base = { date: "2026-12-02", start: "07:30", end: "15:00", body: "CU", scheme: "FSC", today: "2026-11-24" };
  var f1 = P.checkAudit(Object.assign({}, base, { travel: tFar, custody: true }), R);
  has("start przed 8:30", f1, "start");
  has("dojazd ponad limit", f1, "dojazd");
  has("tydzień opieki blokuje nocleg", f1, "opieka_nocleg");
  n++; if (!f1.some(function (x) { return x.code === "opieka_nocleg" && x.level === "block"; })) fails.push("opieka_nocleg nie jest blokadą");
  var f2 = P.checkAudit(Object.assign({}, base, { travel: tFar, custody: false }), R);
  has("bez opieki: nocleg jako informacja", f2, "nocleg");
  has("bez opieki: brak blokady", f2, "opieka_nocleg", false);
  has("sobota", P.checkAudit({ date: "2026-12-05", body: "CU", scheme: "FSC" }, R), "sobota");
  has("sobota dozwolona w regułach", P.checkAudit({ date: "2026-12-05", body: "CU", scheme: "FSC" }, P.parseRules([{ Title: "sobota_dozwolona", Value: "tak" }])), "sobota", false);
  has("niedziela", P.checkAudit({ date: "2026-12-06", body: "CU" }, R), "niedziela");
  var tNear = { km: 120, min: 100, base: "Warszawa" };
  var f3 = P.checkAudit({ date: "2026-12-02", start: "10:00", end: "14:00", body: "SGS", scheme: "KZR INiG", travel: tNear, busy: [{ start: "09:00", end: "09:30", label: "spotkanie" }], today: "2026-11-24" }, R);
  has("kolizja z dojazdem", f3, "kolizja");
  n++; var dep = f3.filter(function (x) { return x.code === "wyjazd"; })[0];
  if (!dep || dep.text.indexOf("08:05") < 0) fails.push("godzina wyjazdu: oczekiwano 08:05, jest " + (dep && dep.text));
  has("plan po terminie", P.checkAudit({ date: "2026-11-27", body: "CU", scheme: "KZR INiG", today: "2026-11-24" }, R), "plan_po_terminie");
  has("audyt w przeszłości bez ostrzeżenia o planie", P.checkAudit({ date: "2026-10-27", body: "SGS", scheme: "KZR INiG", today: "2026-11-24" }, R), "plan_po_terminie", false);
  has("audyt w przeszłości: raport nadal widoczny", P.checkAudit({ date: "2026-10-27", body: "SGS", scheme: "KZR INiG", today: "2026-11-24" }, R), "raport");
  var fs = P.checkAudit({ date: "2026-11-27", body: "CU", scheme: "KZR INiG", today: "2026-11-24", planSent: "2026-11-16T00:00:00Z" }, R);
  has("plan wysłany: bez ostrzeżenia", fs, "plan_po_terminie", false);
  has("plan wysłany: informacja", fs, "plan_wyslany");
  has("audyt wykonany: bez terminów przed audytem", P.checkAudit({ date: "2026-11-27", body: "CU", scheme: "KZR INiG", today: "2026-11-24", done: true }, R), "plan_po_terminie", false);
  var fe = P.checkAudit({ date: "2026-11-25", body: "CU", travel: { km: 237, min: 190, base: "Warszawa", source: "szacunek" } }, R);
  has("szacunek: 237 km bez ostrzeżenia", fe, "dojazd", false);
  has("szacunek: czas jako informacja", fe, "dojazd_czas_szacunek");
  has("czas z map ponad limit: ostrzeżenie", P.checkAudit({ date: "2026-11-25", body: "CU", travel: { km: 237, min: 190, base: "Warszawa", source: "Azure Maps" } }, R), "dojazd_czas");
  has("drugi audyt daleko", P.checkAudit({ date: "2026-12-02", body: "CU", point: WAW, sameDay: [{ point: MIELEC }] }, R), "drugi_daleko");
  has("drugi audyt blisko", P.checkAudit({ date: "2026-12-02", body: "CU", point: WAW, sameDay: [{ point: NEAR }] }, R), "drugi_daleko", false);
  has("trzy audyty dziennie", P.checkAudit({ date: "2026-12-02", body: "CU", sameDay: [{}, {}] }, R), "limit_dnia");

  // tydzień
  var wk = P.buildWeek("2026-11-30", [{ id: 1, date: "2026-12-02", start: "10:00", body: "CU", scheme: "FSC" }, { id: 2, date: "2026-12-09", body: "CU" }],
    { "2026-12-02": [{ start: "16:00", end: "17:00" }] }, function (d) { return d === "2026-12-01"; }, function () { return tNear; }, R, "2026-11-24");
  eq("tydzień ma 7 dni", wk.days.length, 7);
  eq("audyt w środę", wk.days[2].items.length, 1);
  eq("audyt spoza tygodnia pominięty", wk.days.reduce(function (s, d) { return s + d.items.length; }, 0), 1);
  eq("opieka we wtorek", wk.days[1].custody, true);
  eq("zajętość w środę", wk.days[2].busy.length, 1);

  // wolne okna i bloki na raporty
  eq("wolne okna dnia", P.freeWindows([{ start: "10:00", end: "12:00" }], R), [[510, 600], [720, 990]]);
  eq("krótkie okno pominięte", P.freeWindows([{ start: "08:40", end: "16:30" }], R), []);
  var rb = P.reportBlocks({ date: "2026-12-04", body: "SGS" }, function (d) { return d === "2026-12-07" ? { audit: true } : { busy: d === "2026-12-08" ? [{ start: "08:30", end: "14:30" }] : [] }; }, R, "2026-11-24");
  eq("raport SGS: termin", rb.deadline, "2026-12-11");
  eq("raport: bez weekendu i dnia z audytem, reszta dnia z zajętością", rb.blocks.map(function (b) { return b.date + " " + b.start + "-" + b.end; }), ["2026-12-08 14:30-16:30", "2026-12-09 08:30-10:30"]);
  eq("raport: czas wystarcza", rb.short, 0);
  var rs = P.reportBlocks({ date: "2026-12-04", body: "SGS" }, function () { return { audit: true }; }, R, "2026-11-24");
  eq("raport: brak czasu przed terminem", rs.short, 240);

  // warianty terminu
  var va = P.variants({ date: "2026-12-16", start: "09:00", body: "CU", scheme: "FSC", travel: { km: 320, min: 200, base: "Warszawa", source: "Azure Maps" } },
    function (d) { return { custody: d >= "2026-12-14" && d <= "2026-12-20", busy: d === "2026-12-09" ? [{ start: "08:00", end: "10:00" }] : [] }; }, R, "2026-12-01", 3);
  eq("warianty: trzy propozycje", va.length, 3);
  n++; if (va.some(function (v) { return v.date >= "2026-12-14" && v.date <= "2026-12-20"; })) fails.push("wariant w tygodniu opieki mimo noclegu");
  n++; if (va.some(function (v) { return P.weekday(v.date) >= 5; })) fails.push("wariant w weekend");
  n++; if (va.some(function (v) { return v.date < "2026-12-08"; })) fails.push("wariant przed minimum wysyłki planu FSC (7 dni)");
  n++; if (va.some(function (v) { return v.date === "2026-12-09"; })) fails.push("wariant z kolizją przed lepszymi dniami");
  eq("warianty: najbliższy wolny dzień pierwszy", va[0].date, "2026-12-11");
  return { checks: n, fails: fails };
}
