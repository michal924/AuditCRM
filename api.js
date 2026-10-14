// ============================================================
// SharePoint REST API
// ============================================================

const SITE_URL = "https://logisticfit.sharepoint.com/sites/AuditCRM";
// Środowisko TESTOWE (gałąź staging → podgląd PR w Azure SWA „…-<nr PR>.7.azurestaticapps.net”, a także localhost): ta sama witryna i logowanie,
// ale OSOBNE listy Audits_TEST / DevRequests_TEST. Produkcja (auditcrm.logisticfit.com) zawsze na Audits / DevRequests.
const IS_TEST = /-(staging|\d+)\.|^localhost$|^127\.0\.0\.1$/.test(window.location.hostname);   // …-staging.* lub podgląd PR …-<nr>.*
const AUDITS_LIST = IS_TEST ? "Audits_TEST" : "Audits";
const DEV_LIST    = IS_TEST ? "DevRequests_TEST" : "DevRequests";
const CLIENTS_LIST = IS_TEST ? "Clients_TEST" : "Clients";            // LFA Hub, etap 1: karta klienta (tylko środowisko testowe do akceptacji)
window.CLIENTS_ENABLED = IS_TEST;                                       // na produkcji zakładka Klienci niewidoczna, dopóki Michał nie zaakceptuje
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


// ============================================================
// LFA HUB · ETAP 1 — lista Clients + powiązanie ClientId w Audits
// Klient dotąd istniał tylko jako nazwa w audycie (Title). Teraz: osobny rekord + liczbowy ClientId w audycie.
// Pola tworzone z apki (jak kolumny rozliczeń); brak listy/pola nie psuje reszty aplikacji.
// ============================================================
const CLIENT_FIELDS = [
  { name: "NIP",           label: "NIP",                         type: "Text" },
  { name: "Address",       label: "Adres siedziby",              type: "Text" },
  { name: "PostalCode",    label: "Kod pocztowy",                type: "Text" },
  { name: "City",          label: "Miasto",                      type: "Text" },
  { name: "SiteAddress",   label: "Adres zakładu / audytu",      type: "Note" },
  { name: "ContactPerson", label: "Osoba kontaktowa",            type: "Text" },
  { name: "ClientEmail",   label: "E-mail",                      type: "Text" },
  { name: "Phone",         label: "Telefon",                     type: "Text" },
  { name: "CertCodes",     label: "Kody certyfikatów (FSC/PEFC)", type: "Text" },
  { name: "Aliases",       label: "Inne zapisy nazwy (z audytów)", type: "Note" },
  { name: "Notes",         label: "Notatki",                     type: "Note" },
];
const CLIENT_SELECT = ["Id", "Title"].concat(CLIENT_FIELDS.map(f => f.name));
window.clientsListMissing = false;
window.auditClientFieldMissing = false;

async function createListField(listTitle, f) {
  const token = await getToken(); const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${listTitle}')/fields/createfieldasxml`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
    body: JSON.stringify({ parameters: { __metadata: { type: "SP.XmlSchemaFieldCreationInformation" }, SchemaXml: settleFieldSchemaXml(f), Options: 12 } }) });
  if (!r.ok) throw new Error(`${f.name}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 120)}`);
}

// Tworzy listę Clients (jeśli brak), jej kolumny oraz kolumnę ClientId w Audits. Zwraca {created, errors}.
async function ensureClientsSchema() {
  const errors = []; const created = [];
  if (!(await spListExists(CLIENTS_LIST))) {
    const token = await getToken(); const digest = await getDigest(token);
    const r = await fetch(`${SITE_URL}/_api/web/lists`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
      body: JSON.stringify({ __metadata: { type: "SP.List" }, BaseTemplate: 100, Title: CLIENTS_LIST, Description: "Klienci — LFA CRM System (LFA Hub, etap 1)" }) });
    if (!r.ok) throw new Error(`Lista ${CLIENTS_LIST}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 160)}`);
    created.push("lista " + CLIENTS_LIST);
  }
  const have = new Set((await spCustomFields(CLIENTS_LIST)).map(f => f.name));
  for (const f of CLIENT_FIELDS) { if (have.has(f.name)) continue; try { await createListField(CLIENTS_LIST, f); created.push(f.name); } catch (e) { errors.push(e.message); } }
  const auditHave = await fetchAuditFieldNames();
  if (!auditHave.has("ClientId")) {
    try { await createListField(AUDITS_LIST, { name: "ClientId", label: "ID klienta (lista Clients)", type: "Number" }); created.push("Audits.ClientId"); }
    catch (e) { errors.push(e.message); }
  }
  return { created, errors };
}

// Lista klientów; gdy listy brak (404) → [] i flaga clientsListMissing
async function fetchClients() {
  try {
    const items = await spAllItems(CLIENTS_LIST, CLIENT_SELECT.join(","));
    window.clientsListMissing = false; return items;
  } catch (e) { window.clientsListMissing = true; return []; }
}
// Mapa Id audytu → ClientId (osobny odczyt, żeby brak kolumny nie psuł głównego $select)
async function fetchAuditClientIds() {
  try {
    const items = await fetchAuditsWithSelect(["Id", "ClientId"]);
    window.auditClientFieldMissing = false;
    const m = {}; items.forEach(i => { if (i.ClientId != null) m[i.Id] = i.ClientId; }); return m;
  } catch (e) { window.auditClientFieldMissing = true; return {}; }
}
async function addClient(fields) {
  const token = await getToken(); const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${CLIENTS_LIST}')/items`, { method: "POST",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata", "X-RequestDigest": digest },
    body: JSON.stringify(fields) });
  if (!r.ok) throw new Error(`Klient: ${r.status} ${(await r.text().catch(() => "")).substring(0, 120)}`);
  return r.json();
}
async function updateClient(id, fields) {
  await spPatch(`/_api/lists/getbytitle('${CLIENTS_LIST}')/items(${id})`, fields);
}


// ============================================================
// LAURA (Škoda Connect) — przejazdy z CSV: lista Trips. Klucz = koniec jazdy + przebieg końcowy → import idempotentny.
// ============================================================
const TRIPS_LIST = IS_TEST ? "Trips_TEST" : "Trips";
window.LAURA_ENABLED = IS_TEST;
const TRIP_FIELDS = [
  { name: "EndTime",   label: "Koniec jazdy (RRRR-MM-DD GG:MM)", type: "Text" },
  { name: "StartKm",   label: "Przebieg start", type: "Number" },
  { name: "EndKm",     label: "Przebieg koniec", type: "Number" },
  { name: "Km",        label: "Km", type: "Number" },
  { name: "Minutes",   label: "Czas (min)", type: "Number" },
  { name: "Cost",      label: "Koszt paliwa (PLN)", type: "Number" },
  { name: "FuelPrice", label: "Cena paliwa za litr", type: "Number" },
  { name: "ImportFile", label: "Plik źródłowy", type: "Text" },
];
window.tripsListMissing = false;
async function ensureTripsSchema() {
  const created = [], errors = [];
  if (!(await spListExists(TRIPS_LIST))) {
    const token = await getToken(); const digest = await getDigest(token);
    const r = await fetch(`${SITE_URL}/_api/web/lists`, { method: "POST",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose", "X-RequestDigest": digest },
      body: JSON.stringify({ __metadata: { type: "SP.List" }, BaseTemplate: 100, Title: TRIPS_LIST, Description: "Przejazdy z Laury (CSV) — LFA CRM System" }) });
    if (!r.ok) throw new Error(`Lista ${TRIPS_LIST}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 160)}`);
    created.push("lista " + TRIPS_LIST);
  }
  const have = new Set((await spCustomFields(TRIPS_LIST)).map(f => f.name));
  for (const f of TRIP_FIELDS) { if (have.has(f.name)) continue; try { await createListField(TRIPS_LIST, f); created.push(f.name); } catch (e) { errors.push(e.message); } }
  return { created, errors };
}
async function fetchTrips() {
  try { const it = await spAllItems(TRIPS_LIST, ["Id", "Title"].concat(TRIP_FIELDS.map(f => f.name)).join(",")); window.tripsListMissing = false; return it; }
  catch (e) { window.tripsListMissing = true; return []; }
}
// Dodaje przejazdy równolegle (po 5), jeden digest na całą partię
async function addTripsBatch(rows, onProgress) {
  const token = await getToken(); const digest = await getDigest(token); let done = 0; const errs = [];
  for (let i = 0; i < rows.length; i += 5) {
    await Promise.all(rows.slice(i, i + 5).map(async f => {
      const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('${TRIPS_LIST}')/items`, { method: "POST",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Type": "application/json;odata=nometadata", "X-RequestDigest": digest }, body: JSON.stringify(f) });
      if (r.ok) done++; else errs.push(f.Title + ": " + r.status);
    }));
    if (onProgress) onProgress(done, rows.length);
  }
  return { done, errs };
}


// ============================================================
// LFA HUB · DOKUMENTY — biblioteka „Audyty” na witrynach jednostek (LFA-CU, LFA-SGS)
// Struktura: Klient / RRRR-MM-DD_Program_PRJ / 01_… 09_… / plik. Metadane na pliku: klient, audyt CRM, sekcja, typ, źródło.
// ============================================================
const DOC_SITES = {
  CUC: { url: "https://logisticfit.sharepoint.com/sites/LFA-CU",  path: "/sites/LFA-CU",  label: "LFA Control Union" },
  SGS: { url: "https://logisticfit.sharepoint.com/sites/LFA-SGS", path: "/sites/LFA-SGS", label: "LFA SGS" },
};
const DOC_LIB = "Audyty";
const DOC_SECTIONS = ["01_Przygotowanie", "02_Dokumenty_klienta", "03_Dostawcy", "04_GHG", "05_Zdjecia", "06_Raport_roboczy", "07_Podpisane", "08_Paczka", "09_Korespondencja"];
const DOC_TYPE_OF = { "01": "Plan / przygotowanie", "02": "Dokument klienta", "03": "Dostawcy", "04": "GHG", "05": "Zdjęcie", "06": "Raport roboczy", "07": "Podpisany", "08": "Paczka dla jednostki", "09": "Korespondencja" };
const DOC_FIELDS = [
  { name: "ClientId",    label: "ID klienta (CRM)",       type: "Number" },
  { name: "ClientName",  label: "Klient",                 type: "Text" },
  { name: "AuditId",     label: "ID audytu (CRM)",        type: "Number" },
  { name: "AuditLabel",  label: "Audyt",                  type: "Text" },
  { name: "DocSection",  label: "Sekcja",                 type: "Choice", choices: DOC_SECTIONS, defaultValue: "02_Dokumenty_klienta" },
  { name: "DocType",     label: "Typ dokumentu",          type: "Text" },
  { name: "SourceName",  label: "Nazwa źródłowa",         type: "Text" },
  { name: "SourceDate",  label: "Data wgrania do jednostki", type: "Text" },
  { name: "FormCode",    label: "Kod formularza",         type: "Text" },
];

const _docDigest = {};
async function docSite(site, path, opts) {
  opts = opts || {};
  const token = await getToken();
  const h = Object.assign({ Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata" }, opts.headers || {});
  if (opts.write) {
    if (!_docDigest[site.url] || Date.now() - _docDigest[site.url].t > 20 * 60000) {
      const r = await fetch(`${site.url}/_api/contextinfo`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json;odata=nometadata", "Content-Length": "0" } });
      if (!r.ok) throw new Error(`contextinfo ${site.label}: ${r.status}`);
      _docDigest[site.url] = { v: (await r.json()).FormDigestValue, t: Date.now() };
    }
    h["X-RequestDigest"] = _docDigest[site.url].v;
  }
  const r = await fetch(`${site.url}${path}`, { method: opts.method || "GET", headers: h, body: opts.body });
  return r;
}
const _q = s => String(s).replace(/'/g, "''");

// Stan biblioteki: {exists, items?} albo {error}
async function docLibraryState(site) {
  try {
    const r = await docSite(site, `/_api/web/lists/getbytitle('${DOC_LIB}')?$select=Id,ItemCount,EnableVersioning`);
    if (r.status === 404) return { exists: false };
    if (!r.ok) return { error: `HTTP ${r.status}` + (r.status === 403 ? " (brak uprawnień do witryny)" : "") };
    const d = await r.json(); return { exists: true, items: d.ItemCount, versioning: d.EnableVersioning };
  } catch (e) { return { error: e.message || String(e) }; }
}
// Tworzy bibliotekę Audyty, włącza wersjonowanie, dodaje kolumny metadanych. Zwraca {created, errors}.
async function ensureDocLibrary(site) {
  const created = [], errors = [];
  const st = await docLibraryState(site);
  if (st.error) throw new Error(`${site.label}: ${st.error}`);
  if (!st.exists) {
    const r = await docSite(site, `/_api/web/lists`, { method: "POST", write: true,
      headers: { "Content-Type": "application/json;odata=nometadata" },
      body: JSON.stringify({ __metadata: { type: "SP.List" }, BaseTemplate: 101, Title: DOC_LIB, Description: "Audyty klientów — LFA Hub", EnableVersioning: true }) });
    if (!r.ok) throw new Error(`Biblioteka ${DOC_LIB}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 160)}`);
    created.push("biblioteka " + DOC_LIB);
  } else if (!st.versioning) {
    const r = await docSite(site, `/_api/web/lists/getbytitle('${DOC_LIB}')`, { method: "POST", write: true,
      headers: { "Content-Type": "application/json;odata=nometadata", "X-HTTP-Method": "MERGE", "IF-MATCH": "*" }, body: JSON.stringify({ EnableVersioning: true }) });
    if (r.ok) created.push("wersjonowanie");
  }
  const fr = await docSite(site, `/_api/web/lists/getbytitle('${DOC_LIB}')/fields?$select=InternalName&$top=1000`);
  const have = new Set(fr.ok ? ((await fr.json()).value || []).map(f => f.InternalName) : []);
  for (const f of DOC_FIELDS) {
    if (have.has(f.name)) continue;
    const r = await docSite(site, `/_api/web/lists/getbytitle('${DOC_LIB}')/fields/createfieldasxml`, { method: "POST", write: true,
      headers: { Accept: "application/json;odata=verbose", "Content-Type": "application/json;odata=verbose" },
      body: JSON.stringify({ parameters: { __metadata: { type: "SP.XmlSchemaFieldCreationInformation" }, SchemaXml: settleFieldSchemaXml(f), Options: 12 } }) });
    if (r.ok) created.push(f.name); else errors.push(f.name + ": " + r.status);
  }
  return { created, errors };
}
const safeSeg = s => String(s || "").replace(/[~"#%&*:<>?\/{|}\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").substring(0, 80) || "bez_nazwy";
async function docEnsureFolder(site, relPath) {          // relPath względem biblioteki, np. "KORA/2025-10-19_FSC/01_Przygotowanie"
  const parts = relPath.split("/").filter(Boolean); let cur = `${site.path}/${DOC_LIB}`;
  for (const seg of parts) {
    cur += "/" + seg;
    const r = await docSite(site, `/_api/web/folders`, { method: "POST", write: true, headers: { "Content-Type": "application/json;odata=nometadata" },
      body: JSON.stringify({ __metadata: { type: "SP.Folder" }, ServerRelativeUrl: cur }) });
    if (!r.ok && r.status !== 409) throw new Error(`Folder ${cur}: ${r.status}`);   // add jest idempotentne; 409 = już jest
  }
  return cur;
}
// Wgrywa plik (Blob) i ustawia metadane; zwraca ServerRelativeUrl
async function docUpload(site, folderRel, fileName, blob, meta) {
  const folder = await docEnsureFolder(site, folderRel);
  fileName = String(fileName).replace(/[~"#%&*:<>?\\/{|}]/g, " ").replace(/\s+/g, " ").trim();   // znaki niedozwolone w SharePoint
  const r = await docSite(site, `/_api/web/GetFolderByServerRelativeUrl('${_q(folder)}')/Files/add(url='${_q(fileName)}',overwrite=true)`, { method: "POST", write: true, body: blob });
  if (!r.ok) throw new Error(`Plik ${fileName}: ${r.status} ${(await r.text().catch(() => "")).substring(0, 100)}`);
  const f = await r.json(); const url = f.ServerRelativeUrl || (folder + "/" + fileName);
  if (meta && Object.keys(meta).length) {
    const m = await docSite(site, `/_api/web/GetFileByServerRelativeUrl('${_q(url)}')/ListItemAllFields`, { method: "POST", write: true,
      headers: { "Content-Type": "application/json;odata=nometadata", "X-HTTP-Method": "MERGE", "IF-MATCH": "*" }, body: JSON.stringify(meta) });
    if (!m.ok) throw new Error(`Metadane ${fileName}: ${m.status}`);
  }
  return url;
}
