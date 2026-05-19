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

// Pobierz wszystkie audyty (stronicowanie)
async function fetchAllAudits() {
  const select = [
    "Id","Title","ProjectID","Program","AuditType","Standard",
    "AuditDateStart","AuditDateEnd","AuditDays","AuditMode",
    "AuditStatus","Proforma","PlannedCUDate","CertValidTo",
    "City","PostalCode","Address","ClientEmail","Phone","Mobile",
    "Notes","ProcessingUnits","Quarter","Year","AuditorName","ImportFile"
  ].join(",");

  let items = [];
  let url = `/_api/lists/getbytitle('Audits')/items?$select=${select}&$top=500&$orderby=AuditDateStart`;

  while (url) {
    const data = await spGet(url);
    items = items.concat(data.value || []);
    url = data["odata.nextLink"]
      ? data["odata.nextLink"].replace(SITE_URL, "")
      : null;
  }
  return items;
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

// Pobierz istniejące klucze ProjectID+Year (do wykrycia duplikatów przy imporcie)
// Klucz: "ProjectID_Year" np. "12345_2025"
async function fetchExistingProjectIds() {
  const ids = new Set();
  let url = `/_api/lists/getbytitle('Audits')/items?$select=ProjectID,Year&$top=500`;
  while (url) {
    const data = await spGet(url);
    (data.value || []).forEach(item => {
      if (item.ProjectID) {
        const key = `${parseInt(item.ProjectID)}_${item.Year || ""}`;
        ids.add(key);
      }
    });
    url = data["odata.nextLink"]
      ? data["odata.nextLink"].replace(SITE_URL, "")
      : null;
  }
  return ids;
}
