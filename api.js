// ============================================================
// SharePoint REST API
// ============================================================

const SITE_URL = "https://logisticfit.sharepoint.com/sites/AuditCRM";

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
];
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
  let url = `/_api/lists/getbytitle('Audits')/items?$select=${select}&$top=500&$orderby=AuditDateStart`;
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
    window.settleFieldsMissing = false;
    return items;
  } catch (e) {
    console.warn("[Settle] Kolumny rozliczeń niedostępne — odczyt bazowy.", e.message);
    window.settleFieldsMissing = true;
    return fetchAuditsWithSelect(BASE_AUDIT_SELECT);
  }
}

// Nazwy wewnętrzne kolumn istniejących na liście Audits
async function fetchAuditFieldNames() {
  const data = await spGet("/_api/lists/getbytitle('Audits')/fields?$select=InternalName&$top=1000");
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
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('Audits')/fields/createfieldasxml`, {
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
  await spPatch(`/_api/lists/getbytitle('Audits')/items(${id})`, fields);
}

// Dodaj nowy rekord
async function addAudit(fields) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('Audits')/items`, {
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
  const data = await spGet("/_api/lists/getbytitle('DevRequests')/items?$top=200&$orderby=Created desc");
  return data.value || [];
}
async function addDevRequest(fields) {
  const token = await getToken();
  const digest = await getDigest(token);
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('DevRequests')/items`, {
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
  await spPatch(`/_api/lists/getbytitle('DevRequests')/items(${id})`, fields);
}

// Pobierz istniejące klucze ProjectID+Year+Program (do wykrycia duplikatów przy imporcie)
// Klucz: "ProjectID_Year_Program" np. "12345_2025_FSC"
async function fetchExistingProjectIds() {
  const ids = new Set();
  let url = `/_api/lists/getbytitle('Audits')/items?$select=ProjectID,Year,Program&$top=500`;
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
  let url = `/_api/lists/getbytitle('Audits')/items?$select=${select}&$filter=${filter}&$top=500`;
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
  const r = await fetch(`${SITE_URL}/_api/lists/getbytitle('Audits')/items(${id})`, {
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
