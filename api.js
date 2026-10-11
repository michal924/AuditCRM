// ============================================================
// SharePoint REST API
// ============================================================

const SITE_URL = "https://logisticfit.sharepoint.com/sites/AuditCRM";
// Środowisko TESTOWE (gałąź staging → podgląd PR w Azure SWA „…-<nr PR>.7.azurestaticapps.net”, a także localhost): ta sama witryna i logowanie,
// ale OSOBNE listy Audits_TEST / DevRequests_TEST. Produkcja (auditcrm.logisticfit.com) zawsze na Audits / DevRequests.
const IS_TEST = /-(staging|\d+)\.|^localhost$|^127\.0\.0\.1$/.test(window.location.hostname);   // …-staging.* lub podgląd PR …-<nr>.*
const AUDITS_LIST = IS_TEST ? "Audits_TEST" : "Audits";
const DEV_LIST    = IS_TEST ? "DevRequests_TEST" : "DevRequests";
window.IS_TEST = IS_TEST; window.AUDITS_LIST = AUDITS_LIST;

async function spGet(path) {
  const token = await getToken();
  const r = await fetch(`${SITE_URL}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
    },
  });
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

async function spPatch(path, body) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      "X-RequestDigest": digest,
      "X-HTTP-Method": "MERGE",
      "IF-MATCH": "*",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Patch error ${r.status}`);
}

async function getDigest(token) {
  const r = await fetch(`${SITE_URL}/_api/contextinfo`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Length": "0",
    },
  });
  const data = await r.json();
  return data.FormDigestValue;
}

// ── Pola ROZLICZENIA audytu (koszty + wynagrodzenie) — tworzone automatycznie z apki ──
// Kolejność i nazwy wewnętrzne są źródłem prawdy dla $select, zapisu i eksportu.
const SETTLE_FIELDS = [
  { name: "SettleRoute",    label: "Trasa",               type: "Text" },
  { name: "SettleKm",       label: "Km",                  type: "Number" },
  { name: "SettleKmRate",   label: "Stawka km",           type: "Number" },
  { name: "SettleHotel",    label: "Hotel",               type: "Number" },
  { name: "SettleHighway",  label: "Autostrada",          type: "Number" },
  { name: "SettleOther",    label: "Inne koszty",         type: "Number" },
  { name: "SettleTickets",  label: "Bilety PKP/LOT",      type: "Number" },
  { name: "SettleFee",      label: "Wynagrodzenie",       type: "Number" },
  { name: "SettleFeeBasis", label: "Obrót AAF / opłata",  type: "Text" },
  { name: "SettleNote",     label: "Uwagi rozliczenia",   type: "Note" },
  { name: "SettleStatus",   label: "Status rozliczenia",  type: "Choice",
    choices: ["Nierozliczony", "Wysłany do CU", "Rozliczony"], defaultValue: "Nierozliczony" },
  { name: "SettleDate",     label: "Data rozliczenia",    type: "DateTime" },
  { name: "SettleDayRate",  label: "Stawka dzienna (audyt)", type: "Number" },   // nadpisanie stawki podmiotu (np. audyt łączony FSC+PEFC = 2100) — dodane 2026-10-07
  { name: "SettleTravelDays", label: "Dni dojazdu (delegacja)", type: "Number" }, // dodatkowe dni delegacji poza dniami audytu (np. nocleg dzień wcześniej) — 2026-10-09
  { name: "DelegDepart",   label: "Delegacja: wyjazd (data i godzina)",  type: "Text" },   // "2026-09-27 16:00" — oświadczenie o podróży służbowej
  { name: "DelegReturn",   label: "Delegacja: powrót (data i godzina)",  type: "Text" },
  { name: "DelegNo",       label: "Nr oświadczenia o delegacji",         type: "Text" },   // OD/RRRR/MM/nnn — nadany przy pierwszym wydruku
];
const SETTLE_NEWER_FIELDS = ["SettleDayRate", "SettleTravelDays", "DelegDepart", "DelegReturn", "DelegNo"];   // pola dodane później: gdy ich brak, reszta rozliczeń nadal działa
window.settleRateFieldMissing = false;
const SETTLE_FIELD_NAMES = SETTLE_FIELDS.map(f => f.name);
// true gdy lista nie ma jeszcze kolumn rozliczeń → UI pokaże przycisk konfiguracji, zapis pomija te pola
window.settleFieldsMissing = false;

const BASE_AUDIT_SELECT = [
  "Id","Title","ProjectID","Program","AuditType","Standard",
  "AuditDateStart","AuditDateEnd","AuditDays","AuditMode",
  "AuditStatus","Proforma","PlannedCUDate","CertValidTo",
  "City","PostalCode","Address","ClientEmail","Phone","Mobile",
  "Notes","ProcessingUnits","Quarter","Year","AuditorName","ImportFile","CertBody","PlanSentDate"
];

async function fetchAuditsWithSelect(selectArr) {
  const select = selectArr.join(",");
  let items = [];
  let url = `/_api/lists/getbytitle('${AUDITS_LIST}')/items?$select=${select}&$top=500&$orderby=AuditDateStart`;
  while (url) {
    const data = await spGet(url);
    items = items.concat(data.value || []);
    url = data["odata.nextLink"] ? data["odata.nextLink"].replace(SITE_URL, "") : null;
  }
  return items;
}

// Pobierz wszystkie audyty (stronicowanie). Najpierw z polami rozliczeń;
// gdy kolumn jeszcze nie ma (400), wraca do zestawu bazowego — apka działa dalej.
async function fetchAllAudits() {
  try {
    const items = await fetchAuditsWithSelect(BASE_AUDIT_SELECT.concat(SETTLE_FIELD_NAMES));
    window.settleFieldsMissing = false; window.settleRateFieldMissing = false;
    return items;
  } catch (e0) {
    try {
      // Starsze kolumny rozliczeń są, brakuje tylko nowszych (np. SettleDayRate) → czytamy bez nich
      const items = await fetchAuditsWithSelect(BASE_AUDIT_SELECT.concat(SETTLE_FIELD_NAMES.filter(n => !SETTLE_NEWER_FIELDS.includes(n))));
      window.settleFieldsMissing = false; window.settleRateFieldMissing = true;
      console.warn("[Settle] Brak nowszych kolumn rozliczeń:", SETTLE_NEWER_FIELDS.join(", "));
      return items;
    } catch (e) {
      console.warn("[Settle] Kolumny rozliczeń niedostępne — odczyt bazowy.", e.message);
      window.settleFieldsMissing = true; window.settleRateFieldMissing = true;
      return fetchAuditsWithSelect(BASE_AUDIT_SELECT);
    }
  }
}

// Nazwy wewnętrzne kolumn istniejących na liście Audits
async function fetchAuditFieldNames() {
  const data = await spGet(`/_api/lists/getbytitle('${AUDITS_LIST}')/fields?$select=InternalName&$top=1000`);
  return new Set((data.value || []).map(f => f.InternalName));
}

function settleFieldSchemaXml(f) {
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const common = `DisplayName="${esc(f.label)}" Name="${f.name}" StaticName="${f.name}"`;
  switch (f.type) {
    case "Number":   return `<Field Type="Number" ${common} Decimals="2" />`;
    case "Note":     return `<Field Type="Note" ${common} NumLines="4" RichText="FALSE" />`;
    case "DateTime": return `<Field Type="DateTime" ${common} Format="DateOnly" />`;
    case "Choice":   return `<Field Type="Choice" ${common} Format="Dropdown"><Default>${esc(f.defaultValue)}</Default>` +
                            `<CHOICES>${f.choices.map(c => `<CHOICE>${esc(c)}</CHOICE>`).join("")}</CHOICES></Field>`;
    default:         return `<Field Type="Text" ${common} MaxLength="255" />`;
  }
}

// Utwórz jedną kolumnę przez createfieldasxml (Options 12 = AddFieldInternalNameHint + AddToDefaultContentType)
async function createAuditField(f) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${AUDITS_LIST}')/fields/createfieldasxml`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=verbose",
      "Content-Type": "application/json;odata=verbose",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify({ parameters: {
      __metadata: { type: "SP.XmlSchemaFieldCreationInformation" },
      SchemaXml: settleFieldSchemaXml(f),
      Options: 12,
    }}),
  });
  if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error(`${f.name}: ${r.status} ${txt.substring(0, 160)}`); }
}

// Dodaj brakujące kolumny rozliczeń. Zwraca {created, existing, errors}.
async function ensureSettleFields() {
  const existing = await fetchAuditFieldNames();
  const created = [], skipped = [], errors = [];
  for (const f of SETTLE_FIELDS) {
    if (existing.has(f.name)) { skipped.push(f.name); continue; }
    try { await createAuditField(f); created.push(f.name); }
    catch (e) { errors.push(e.message); }
  }
  return { created, existing: skipped, errors };
}

// Pobierz audytorów
async function fetchAuditors() {
  const data = await spGet(
    "/_api/lists/getbytitle('Auditors')/items?$select=Title,DisplayName&$top=50&$orderby=Title"
  );
  return data.value || [];
}

// Zaktualizuj rekord
async function updateAudit(id, fields) {
  await spPatch(`/_api/lists/getbytitle('${AUDITS_LIST}')/items(${id})`, fields);
}

// Dodaj nowy rekord
async function addAudit(fields) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${AUDITS_LIST}')/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify(fields),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Add error ${r.status}: ${txt.substring(0, 200)}`);
  }
  return r.json();
}

// ── Zgłoszenia rozwoju aplikacji (lista DevRequests) ──
async function fetchDevRequests() {
  // Bez $select pól niestandardowych — dzięki temu ew. inna nazwa kolumny nie wywala odczytu (400)
  const data = await spGet(`/_api/lists/getbytitle('${DEV_LIST}')/items?$top=200&$orderby=Created desc`);
  return data.value || [];
}
async function addDevRequest(fields) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${DEV_LIST}')/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json;odata=nometadata",
      "Content-Type": "application/json;odata=nometadata",
      "X-RequestDigest": digest,
    },
    body: JSON.stringify(fields),
  });
  if (!r.ok) { const txt = await r.text().catch(() => ""); throw new Error(`Add DevRequest ${r.status}: ${txt.substring(0, 200)}`); }
  return r.json();
}
async function updateDevRequest(id, fields) {
  await spPatch(`/_api/lists/getbytitle('${DEV_LIST}')/items(${id})`, fields);
}

// Pobierz istniejące klucze ProjectID+Year+Program (do wykrycia duplikatów przy imporcie)
// Klucz: "ProjectID_Year_Program" np. "12345_2025_FSC"
async function fetchExistingProjectIds() {
  const ids = new Set();
  let url = `/_api/lists/getbytitle('${AUDITS_LIST}')/items?$select=ProjectID,Year,Program&$top=500`;
  while (url) {
    const data = await spGet(url);
    (data.value || []).forEach(item => {
      if (item.ProjectID) {
        const key = `${parseInt(item.ProjectID)}_${item.Year || ""}_${item.Program || ""}`;
        ids.add(key);
      }
    });
    url = data["odata.nextLink"]
      ? data["odata.nextLink"].replace(SITE_URL, "")
      : null;
  }
  return ids;
}

// Pobierz pełne rekordy dla danego Kwartału+Roku które były importowane (ImportFile != null)
async function fetchImportedForQuarter(quarter, year) {
  const filter = encodeURIComponent(
    `Quarter eq '${quarter}' and Year eq '${year}' and ImportFile ne null`
  );
  const select = "Id,ProjectID,Year,Program,Title,AuditStatus,AuditDateStart,ImportFile";
  let items = [];
  let url = `/_api/lists/getbytitle('${AUDITS_LIST}')/items?$select=${select}&$filter=${filter}&$top=500`;
  while (url) {
    const data = await spGet(url);
    items = items.concat(data.value || []);
    url = data["odata.nextLink"]
      ? data["odata.nextLink"].replace(SITE_URL, "")
      : null;
  }
  return items;
}

// Usuń rekord audytu
async function deleteAudit(id) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${AUDITS_LIST}')/items(${id})`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "X-RequestDigest": digest,
      "X-HTTP-Method": "DELETE",
      "IF-MATCH": "*",
    },
  });
  if (!r.ok) throw new Error(`Delete error ${r.status}`);
}


// ============================================================
// ŚRODOWISKO TESTOWE — listy *_TEST jako kopia schematu produkcji i (opcjonalnie) kopia danych. Produkcja tylko do odczytu.
// ============================================================
async function spListExists(title) {
  const token = await getToken();
  const r = await fetch(`${SITE_URL}/_api/web/lists/getbytitle('${title}')?$select=Id`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } });
  return r.ok;
}
async function spCreateList(title) {
  const token = await getToken(); const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/web/lists`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
    body: JSON.stringify({ __metadata: { type: "SP.List" }, BaseTemplate: 100, Title: title, Description: "Kopia testowa — LFA CRM System (staging)" }) });
  if (!r.ok) throw new Error(`Lista ${title}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 160)}`);
}
// Kolumny niestandardowe listy (bez systemowych); SchemaXml bez identyfikatorów, żeby odtworzyć je na innej liście
async function spCustomFields(title) {
  const data = await spGet(`/_api/lists/getbytitle('${title}')/fields?$select=InternalName,SchemaXml,Hidden,ReadOnlyField,FromBaseType,CanBeDeleted,Sealed&$top=1000`);
  return (data.value || []).filter(f => !f.Hidden && !f.ReadOnlyField && !f.FromBaseType && f.CanBeDeleted && !f.Sealed)
    .map(f => ({ name: f.InternalName, xml: f.SchemaXml.replace(/\s(ID|SourceID|Version|ColName|RowOrdinal|List|WebId)="[^"]*"/g, "") }));
}
async function spCreateFieldXml(title, xml) {
  const token = await getToken(); const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${title}')/fields/createfieldasxml`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
    body: JSON.stringify({ parameters: { __metadata: { type: "SP.XmlSchemaFieldCreationInformation" }, SchemaXml: xml, Options: 12 } }) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => "")).substring(0, 120)}`);
}
async function spAllItems(title, select) {
  const token = await getToken(); let url = `${SITE_URL}/_api/lists/getbytitle('${title}')/items?$select=${select}&$top=500`; const out = [];
  while (url) { const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" } }); if (!r.ok) throw new Error(`Odczyt ${title}: ${r.status}`); const d = await r.json(); out.push(...(d.value || [])); url = d["odata.nextLink"] || null; }
  return out;
}
async function spAddItem(title, fields) {
  const token = await getToken(); const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${title}')/items`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata", "X-RequestDigest": digest }, body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text().catch(() => "")).substring(0, 120)}`);
}
async function spDeleteAllItems(title) {
  if (!/_TEST$/.test(title)) throw new Error("Czyszczenie dozwolone tylko dla list *_TEST");   // bezpiecznik: nigdy produkcja
  const items = await spAllItems(title, "Id"); const token = await getToken(); const digest = await getDigest(token); let n = 0;
  for (const it of items) { const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${title}')/items(${it.Id})`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "X-RequestDigest": digest, "X-HTTP-Method": "DELETE", "IF-MATCH": "*" } }); if (r.ok) n++; }
  return n;
}
// Tworzy/uzupełnia listę TEST wg schematu produkcyjnej. copyData → kasuje dane TEST i kopiuje wszystkie rekordy z produkcji.
async function setupTestList(prodTitle, testTitle, copyData, onProgress) {
  if (!/_TEST$/.test(testTitle)) throw new Error("Cel musi być listą *_TEST");
  const log = m => { if (onProgress) onProgress(m); };
  if (!(await spListExists(testTitle))) { await spCreateList(testTitle); log(`Utworzono listę ${testTitle}`); }
  const prodFields = await spCustomFields(prodTitle);
  const have = new Set((await spCustomFields(testTitle)).map(f => f.name)); let created = 0; const errors = [];
  for (const f of prodFields) { if (have.has(f.name) || f.name === "Title") continue; try { await spCreateFieldXml(testTitle, f.xml); created++; } catch (e) { errors.push(f.name + ": " + e.message); } }
  log(`Kolumny: ${prodFields.length} na produkcji, utworzono ${created}` + (errors.length ? `, błędy ${errors.length}` : ""));
  let copied = 0;
  if (copyData) {
    const names = ["Title"].concat(prodFields.map(f => f.name).filter(n => n !== "Title"));
    const removed = await spDeleteAllItems(testTitle); log(`Wyczyszczono ${testTitle}: ${removed} rekordów`);
    const items = await spAllItems(prodTitle, names.join(","));
    for (const it of items) { const f = {}; names.forEach(n => { if (it[n] !== undefined && it[n] !== null) f[n] = it[n]; }); try { await spAddItem(testTitle, f); copied++; } catch (e) { errors.push("rekord " + (it.Title || "") + ": " + e.message); } if (copied % 25 === 0) log(`Skopiowano ${copied}/${items.length}…`); }
    log(`Skopiowano ${copied}/${items.length} rekordów do ${testTitle}`);
  }
  return { created, copied, errors };
}
