// ============================================================
// PLAN AUDYTU (PDF) → data, godziny, miejsce audytu (Michał 2026-11-14)
// Obsługiwane szablony: CU FSC CoC, CU PEFC CoC, CU FSC+PEFC, CU KZR INiG i SURE (F-03, z Excela), SGS KZR INiG (PQPC-23-07).
// Plik czytany lokalnie w przeglądarce (pdf.js), nigdzie nie jest wysyłany. Wynik trafia do okna potwierdzenia, nie zapisuje się sam.
// ============================================================
const PlanReader = (function () {
  // Fragmenty jednej linii: spacja tylko gdy jest odstęp między fragmentami (pdf.js tnie słowa na kawałki)
  function joinParts(parts) {
    parts.sort((a, b) => a.x - b.x);
    let s = "", prevEnd = null;
    parts.forEach(p => { const gap = prevEnd == null ? 0 : p.x - prevEnd;
      s += (prevEnd != null && gap > 1.5 && !/\s$/.test(s) && !/^\s/.test(p.s) ? " " : "") + p.s; prevEnd = p.x + p.w; });
    return s.replace(/\s+/g, " ").trim();
  }
  // Tekst PDF w kolejności czytania: elementy grupowane w linie po współrzędnej y, w linii od lewej do prawej
  async function pdfText(arrayBuffer) {
    if (!window.pdfjsLib) throw new Error("Brak biblioteki PDF");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "pdf.worker.min.js";
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const items = (await (await doc.getPage(p)).getTextContent()).items.filter(i => i.str && i.str.trim());
      const rows = [];
      items.forEach(i => { const y = i.transform[5], x = i.transform[4];
        let r = rows.find(r => Math.abs(r.y - y) < 3); if (!r) { r = { y, parts: [] }; rows.push(r); } r.parts.push({ x, w: i.width || 0, s: i.str }); });
      rows.sort((a, b) => b.y - a.y).forEach(r => out.push(joinParts(r.parts)));
    }
    return out.filter(Boolean).join("\n");
  }

  const pad = n => String(n).padStart(2, "0");
  const iso = (d, m, y) => { y = String(y).length === 2 ? "20" + y : String(y); return `${y}-${pad(m)}-${pad(d)}`; };
  const hm = (h, m) => `${pad(h)}:${pad(m)}`;
  const DATE = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4}|\d{2})(?!\d)/;
  const DATETIME = /(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4}|\d{2})(?!\d)\s*(?:r\.)?\s*[,;]?\s*(?:godz(?:ina)?\.?\s*:?\s*)?(\d{1,2})[:.](\d{2})/;
  const TIME_RANGE = /(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/g;
  // Adres: kotwicą jest kod pocztowy. Układ „ulica nr, 00-000 Miasto” albo „00-000 Miasto, ulica nr”.
  // Próbuje pierwszej linii, potem dwóch złączonych (adres bywa złamany na dwie linie).
  const STOP = /\s+(?:POLAND|Polska|Przedstawiciel|Organizacja|Norma|Data|Spotkanie|Przegl|System|Tartak|Weryfikacja|Siedziba|Rodzaj|Planowana|Tel|E-mail|\(|\d{1,2}\.\d{1,2}\.\d{4}).*$/i;
  function addrFrom(seg) {
    const t = seg.replace(/\s+/g, " ").trim(); const m = t.match(/(\d{2})\s?[-–]\s?(\d{3})\s+([^,;\n]+)/); if (!m) return null;
    const postal = `${m[1]}-${m[2]}`; let city = m[3].replace(STOP, "").replace(/[.,;\s]+$/, "").trim();
    city = city.split(" ").slice(0, 3).join(" ");
    const before = t.slice(0, m.index).replace(/[,;\s]+$/, "").trim(), afterCity = t.slice(m.index + m[0].length).replace(/^[,;\s]+/, "").replace(STOP, "").trim();
    let street = /\d/.test(before) ? before.split(/[;]/).pop().trim() : (/\d/.test(afterCity) ? afterCity.split(/[,;]/)[0].trim() : before);
    street = street.replace(/^.*?(?:Adres(?: rejestrowy)?:?|lokalizacja\/e|do odwiedzenia)\s*/i, "").trim();
    // „Siedziba, tartak Modryniec 138” → ostatni człon z numerem, bez opisu typu lokalizacji pisanego małą literą
    const parts = street.split(",").map(x => x.trim()).filter(x => /\d/.test(x));
    if (parts.length) street = parts[parts.length - 1];
    street = street.replace(/^(?:[a-ząęółśżźćń]{3,}\s+)+/, "").trim();
    if (!street || !city) return null;
    return { street, postal, city };
  }
  function parseAddr(s) {
    if (!s) return null;
    const lines = String(s).split("\n").map(x => x.trim()).filter(Boolean);
    for (let n = 1; n <= Math.min(3, lines.length); n++) { const a = addrFrom(lines.slice(0, n).join(" ")); if (a) return a; }
    return null;
  }
  const addrText = a => a ? `${a.street}, ${a.postal} ${a.city}` : "";
  // Tekst po etykiecie (do n znaków), z liniami złączonymi spacją
  function after(text, re, n = 220) { const m = text.match(re); if (!m) return ""; return text.substr(m.index + m[0].length, n).replace(/^[ \t:]+/, ""); }

  function detect(t) {
    if (/PQPC-23-07|PLAN AUDITU ZRÓWNOWAŻONEGO/i.test(t)) return { body: "SGS", scheme: "KZR INiG", tpl: "SGS KZR INiG" };
    if (/PLAN RAMOWY/i.test(t)) return /SURE|REDCERT/i.test(t) ? { body: "CUC", scheme: "SURE", tpl: "CU SURE (F-03)" } : { body: "CUC", scheme: "KZR INiG", tpl: "CU KZR INiG (F-03)" };
    const fsc = /FSC/.test(t), pefc = /PEFC/.test(t);
    if (/FSCPEFCCUCOCAUDPLAN|FSC i PEFC/i.test(t) || (fsc && pefc && /Plan audytu/i.test(t) && /FSC.*PEFC|PEFC.*FSC/s.test(t.slice(0, 600)))) return { body: "CUC", scheme: "FSC+PEFC", tpl: "CU FSC + PEFC CoC" };
    if (/Plan audytu dla łańcucha dostaw PEFC|Annex Ic|PEFC CoC/i.test(t.slice(0, 800))) return { body: "CUC", scheme: "PEFC", tpl: "CU PEFC CoC" };
    if (/Plan audytu łańcucha dostaw FSC|FSCCUCOCAUDPLAN/i.test(t)) return { body: "CUC", scheme: "FSC", tpl: "CU FSC CoC" };
    return { body: "", scheme: "", tpl: "nierozpoznany" };
  }

  function parse(text, fileName) {
    const t = String(text || "");
    const r = Object.assign(detect(t), { date: "", start: "", end: "", site: null, registered: null, id: "", name: "", hours: null, notes: [] });
    // ── identyfikator: PRJ (CU) albo numer projektu SGS ──
    let m = t.match(/PL\/KZR\/[A-Z]+-\d+/); if (m) r.id = m[0];
    if (!r.id) { m = t.match(/Numer projektu\s*:?\s*(\d{5,7})/i) || String(fileName || "").match(/_(\d{6})_/); if (m) r.id = m[1]; }
    // ── nazwa firmy ──
    m = t.match(/(?:Nazwa firmy\/organizacji|Organizacja:|^Nazwa firmy)\s*(.+)/im) || t.match(/Adresat:\s*\n(.+)/);
    if (m) r.name = m[1].trim();

    if (r.tpl.startsWith("SGS")) {
      m = t.match(/Data\(-y\) auditu:?\s*(\d{1,2})\.(\d{1,2})\.(\d{4})/i); if (m) r.date = iso(m[1], m[2], m[3]);
      const sched = t.slice(Math.max(0, t.search(/Harmonogram auditu/i)));
      const ranges = [...sched.matchAll(TIME_RANGE)];
      if (ranges.length) { r.start = hm(ranges[0][1], ranges[0][2]); const l = ranges[ranges.length - 1]; r.end = hm(l[3], l[4]); }
      r.registered = parseAddr(after(t, /Adres rejestrowy:?/i, 160));
      // miejsce: kolumna „Miejsce auditu” w harmonogramie (pierwszy wiersz), awaryjnie tabela lokalizacji
      r.site = parseAddr(after(sched, /\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}/, 160)) || parseAddr(after(t, /Adres lokalizacji\s*Data auditu\s*\n?\s*\d+\s+/i, 200));
    } else if (r.tpl.includes("F-03")) {
      m = after(t, /Rozpoczęcie/i, 60).match(DATETIME);
      if (m) { r.date = iso(m[1], m[2], m[3]); r.start = hm(m[4], m[5]); }
      else { const d = after(t, /Rozpoczęcie/i, 60).match(DATE) || after(t, /Planowana data audytu/i, 300).match(DATE); if (d) r.date = iso(d[1], d[2], d[3]); }
      m = after(t, /Spotkanie zamykające/i, 60).match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/); if (m) r.end = hm(m[3], m[4]);
      const head = t.match(/^Adres\s+(.+)$/m); r.registered = head ? parseAddr(head[1]) : null;
      const onsite = t.match(/^(?:Adres i data\s+)?(.+?)\s*(?:\([^)]*\))?\s*;\s*\d{1,2}\.\d{1,2}\.\d{4}\s*,\s*na miejscu/im);
      r.site = (onsite && parseAddr(onsite[1])) || r.registered;
    } else {
      // CU FSC / PEFC / FSC+PEFC (Word → PDF)
      m = after(t, /Data[^\n]{0,20}?i godzina(?:\s*rozpocz\S*)?/i, 120).match(DATETIME) || after(t, /Spotkanie otwierające/i, 80).match(DATETIME);
      if (m) { r.date = iso(m[1], m[2], m[3]); r.start = hm(m[4], m[5]); }
      const close = after(t, /Spotkanie zamykające/i, 60);
      const cr = close.match(/(\d{1,2})[:.](\d{2})\s*[-–]\s*(\d{1,2})[:.](\d{2})/);
      if (cr) r.end = hm(cr[3], cr[4]);
      else { const c1 = close.match(DATETIME); if (c1) { const mins = (+c1[4]) * 60 + (+c1[5]) + 30; r.end = hm(Math.floor(mins / 60) % 24, mins % 60); r.notes.push("koniec: spotkanie zamykające + 30 min"); } }
      r.site = parseAddr(after(t, /(?:Odwiedzana\/e lokalizacja\/e|Lokalizacja\(-?e\)\s*do odwiedzenia)/i, 160));
      m = t.match(/Adresat:\s*\n.+\n(.+)/); if (m) r.registered = parseAddr(m[1]);
      if (!r.registered) r.registered = parseAddr(after(t, /Pełn[ey] adres[^\n]*?(?:kontaktowej|firmy)/i, 120));
    }
    // ── czas trwania (godziny), gdy brak końca ──
    m = t.match(/czas\s*(?:trwania)?\s*(?:audytu)?\s*(?:\(liczba h\))?\s*:?\s*\n?\s*(\d+(?:[.,]\d+)?)\s*(?:h|godz)/i);
    if (m) r.hours = parseFloat(m[1].replace(",", "."));
    if (r.start && !r.end && r.hours) { const mins = (+r.start.slice(0, 2)) * 60 + (+r.start.slice(3)) + Math.min(r.hours, 8) * 60; r.end = hm(Math.floor(mins / 60) % 24, Math.round(mins % 60)); r.notes.push("koniec: start + czas trwania (maks. 8 h dziennie)"); }
    r.siteText = addrText(r.site); r.registeredText = addrText(r.registered);
    return r;
  }
  return { pdfText, parse, parseAddr };
})();
window.PlanReader = PlanReader;
