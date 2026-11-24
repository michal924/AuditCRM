// Testy czytnika planów audytu (plan.js → PlanReader.parse) na SYNTETYCZNYCH tekstach.
// Teksty odwzorowują układ, jaki pdf.js daje z prawdziwych planów (linie przeplatane kolumnami),
// ale nie zawierają danych żadnego klienta. Uruchamia je scripts/test.sh (JavaScriptCore, bez Node).
// Każdy test: [nazwa, tekst, nazwa pliku, oczekiwane pola].
var PLAN_TESTS = [
  ["CU FSC: data, godziny, miejsce inne niż siedziba", [
    "Adresat:", "Firma Testowa Sp. z o.o.", "ul. Biurowa 1, 00-001 Warszawa",
    "Temat l Plan audytu łańcucha dostaw FSC® CoC",
    "Numer projektu 123456",
    "Nazwa firmy/organizacji Firma Testowa Sp. z o.o.",
    "Odwiedzana/e lokalizacja/e Fabryczna 5, 05-300 Mińsk Mazowiecki, POLAND",
    "Data (daty) i godzina rozpoczęcia",
    "audytu",
    "18.09.2026 r., 10:00",
    "Oczekiwany czas trwania audytu 4 godziny",
    "Spotkanie zamykające 18.09.2026 r.; 13:30 – 14:00"
  ].join("\n"), "FSCCUCOCAUDPLAN_L01_PL_123456_2026.pdf",
    { tpl: "CU FSC CoC", id: "123456", date: "2026-09-18", start: "10:00", end: "14:00", siteText: "Fabryczna 5, 05-300 Mińsk Mazowiecki", registeredText: "ul. Biurowa 1, 00-001 Warszawa" }],

  ["CU PEFC: godzina w formacie „godz:”", [
    "Adresat:", "Firma Testowa Sp. z o.o.", "ul. Biurowa 1, 00-001 Warszawa",
    "Temat Plan audytu dla łańcucha dostaw PEFC CoC",
    "Numer projektu 123456",
    "Lokalizacja(e) do odwiedzenia Fabryczna 5, 05-300 Mińsk Mazowiecki, POLAND",
    "Data audytu i godzina rozpoczę- 18.09.2026 r. godz: 14:00",
    "cia",
    "Przewidywany czas trwania 4h",
    "Spotkanie zamykające 18.09.2026; godz: 17:30"
  ].join("\n"), "plan_pefc.pdf",
    { tpl: "CU PEFC CoC", date: "2026-09-18", start: "14:00", end: "18:00", siteText: "Fabryczna 5, 05-300 Mińsk Mazowiecki" }],

  ["CU KZR F-03: rozpoczęcie i adres z nagłówka", [
    "PLAN AUDYTU", "KZR INiG – System certyfikacji zrównoważonej produkcji biopaliw",
    "Nazwa firmy Firma Testowa Sp. z o.o.",
    "Adres ul. Leśna 3, 39-300 Mielec",
    "Planowana data audytu 18.11.2026",
    "PLAN RAMOWY", "Data i czas", "Rozpoczęcie", "18.11.2026, 10:00",
    "Spotkanie zamykające (18.11.2026, 13:45-14:00)"
  ].join("\n"), "Plan Audytu_V6_123456_2026.pdf",
    { tpl: "CU KZR INiG (F-03)", id: "123456", date: "2026-11-18", start: "10:00", end: "14:00", siteText: "ul. Leśna 3, 39-300 Mielec" }],

  ["CU SURE F-03: bez godziny startu", [
    "PLAN AUDYTU", "System certyfikacji SURE-EU",
    "Nazwa firmy Firma Testowa",
    "Adres ul. Polna 25, 42-230 Koniecpol, POLAND",
    "Planowana data audytu 10.06.2026",
    "PLAN RAMOWY", "Rozpoczęcie", "10.06.2026"
  ].join("\n"), "F-03 SURE_Audit_Plan_PL_EN_V1_123456_2026.pdf",
    { tpl: "CU SURE (F-03)", date: "2026-06-10", start: "", siteText: "ul. Polna 25, 42-230 Koniecpol" }],

  ["SGS KZR: adres złamany w harmonogramie, miasto w kolejnej linii", [
    "PLAN AUDITU ZRÓWNOWAŻONEGO ROZWOJU",
    "Numer projektu: PL/KZR/BIO-999",
    "Organizacja: Zakład Testowy Sp. z o.o.",
    "Adres rejestrowy: ul. Przemysłowa 35A, 24-200 Bełżyce",
    "Data(-y) auditu: 17.11.2026 Data",
    "Adres lokalizacji Data auditu",
    "ul. Przemysłowa 35A, 24-200",
    "1 Siedziba, zakład, magazyn 17.11.2026",
    "Bełżyce",
    "Harmonogram auditu",
    "Data Czas Miejsce auditu Zakresy / Procesy i Czynności",
    "ul. Przemysłowa",
    "35A, 24-200",
    "10:00 - 10:15 Spotkanie otwierające",
    "Bełżyce",
    "15:45 - 16:30 Spotkanie zamykające"
  ].join("\n"), "PQPC-23-07-KZR_Plan_auditu.pdf",
    { tpl: "SGS KZR INiG", id: "PL/KZR/BIO-999", date: "2026-11-17", start: "10:00", end: "16:30", siteText: "ul. Przemysłowa 35A, 24-200 Bełżyce" }],

  ["SGS KZR: zakład z tym samym kodem co siedziba, data rozcina adres", [
    "PLAN AUDITU ZRÓWNOWAŻONEGO ROZWOJU",
    "Numer projektu: PL/KZR/BIO-998",
    "Adres rejestrowy: Rynek II 6, 21-100 Lubartów",
    "Data(-y) auditu: 16.11.2026 Data",
    "Harmonogram auditu",
    "Miejsce auditu Zakresy / Procesy i Czynności",
    "16.11.202 Wólka Testowa 100,",
    "10:00 - 10:15 Spotkanie otwierające",
    "6 21-100 Lubartów",
    "15:50 - 16:05 Spotkanie zamykające"
  ].join("\n"), "PQPC.pdf",
    { tpl: "SGS KZR INiG", date: "2026-11-16", start: "10:00", end: "16:05", siteText: "Wólka Testowa 100, 21-100 Lubartów" }],

  ["SGS KZR: miasto złamane na myślniku", [
    "PLAN AUDITU ZRÓWNOWAŻONEGO ROZWOJU",
    "Numer projektu: PL/KZR/BIO-997",
    "Adres rejestrowy: Zwierzyniec 52, 28-100 Busko-Zdrój",
    "Data(-y) auditu: 26.09.2026 Data",
    "Harmonogram auditu",
    "Miejsce auditu Zakresy / Procesy i Czynności",
    "Zwierzyniec 52, 28-100 Busko-",
    "10:00 - 10:15 Spotkanie otwierające",
    "Zdrój",
    "13:45 - 14:00 Spotkanie zamykające"
  ].join("\n"), "PQPC.pdf",
    { siteText: "Zwierzyniec 52, 28-100 Busko-Zdrój", start: "10:00", end: "14:00" }],
];

function runPlanTests(PlanReader) {
  var fails = [], n = 0;
  PLAN_TESTS.forEach(function (t) {
    var r = PlanReader.parse(t[1], t[2]);
    Object.keys(t[3]).forEach(function (k) {
      n++;
      var got = r[k] == null ? "" : String(r[k]);
      if (got !== t[3][k]) fails.push(t[0] + " → " + k + ": oczekiwano „" + t[3][k] + "”, jest „" + got + "”");
    });
  });
  return { checks: n, fails: fails };
}
