// ============================================================
// Audit CRM — Main Application
// ============================================================

const MY_AUDITOR = "Rzeźnik Michał";

let allAudits = [];
let currentAudit = null;
let currentStatus = null;
let currentProforma = null;
let importParsed = [];

// ============================================================
// MAPOWANIA (zgodne z 03_Import-QuarterlyPlan.py)
// ============================================================
const AUDITOR_MAP = {
  "rzeznik, mr. (michal)":                     MY_AUDITOR,
  "rzeznik, mr.  (michal)":                    MY_AUDITOR,
  "rzeźnik michał":                             MY_AUDITOR,
  "rzeznik michal":                             MY_AUDITOR,
  "meler, mr. lm (leszek)":                    "Meler Leszek",
  "meler, mr. lm (leszek) ":                   "Meler Leszek",
  "meler, miss (monika)":                       "Meler Monika",
  "meler, miss  (monika)":                      "Meler Monika",
  "chojnacki, mr.  (ireneusz)":                 "Chojnacki Ireneusz",
  "wieczorek, mr.  (przemyslaw)":               "Wieczorek Przemysław",
  "wieczorek, mrs.  (alicja)":                  "Wieczorek Alicja",
  "kozak, mrs. ak (agnieszka)":                 "Kozak Agnieszka",
  "kret, mr. dk (daniel)":                      "Kret Daniel",
  "dabrowski, mr.  (lukasz)":                   "Dąbrowski Łukasz",
  "dabrowski łukasz":                           "Dąbrowski Łukasz",
  "mysiak, mrs.  (weronika)":                   "Mysiak Weronika",
  "stachura, mrs. ks (krystyna) dr.":           "Stachura Krystyna",
  "marczewski, mr. lm (lukasz)":                "Marczewski Łukasz",
  "kedziora-urbanowicz, mrs. aku (agnieszka)":  "Kędziora-Urbanowicz Agnieszka",
  "siutaj, mr.  (wieslaw)":                     "Siutaj Wiesław",
  "piechota edyta":                             "Piechota Edyta",
  "stanko, mr. ms (pawel)":                     "Stanko Paweł",
};

const SPG_TO_PROGRAM = {
  "fsc chain of custody (coc)": "FSC",
  "pefc - chain of custody":    "PEFC",
  "kzr inig":                   "KZR INiG",
  "sure-eu_pl":                 "SURE",
  "sure-eu":                    "SURE",
  "eudr":                       "EUDR",
};

const AUDIT_TYPE_MAP = {
  "surveillance announced":  "Surveillance announced",
  "re-assessment":           "Re-assessment",
  "re-certification audit":  "Re-Certification Audit",
  "certification audit":     "Certification Audit",
  "extension audit":         "Extension Audit",
  "main":                    "Main",
  "change of scope":         "Change of scope",
};

function normAuditor(name) {
  if (!name || String(name).trim() === "" || String(name).toLowerCase() === "nan") return "";
  return AUDITOR_MAP[String(name).trim().toLowerCase()] || String(name).trim();
}

function normProgram(spg) {
  if (!spg) return "";
  return SPG_TO_PROGRAM[String(spg).trim().toLowerCase()] || String(spg).trim();
}

function normAuditType(t) {
  if (!t) return "";
  return AUDIT_TYPE_MAP[String(t).trim().toLowerCase()] || String(t).trim();
}

function safeStr(val) {
  if (val === null || val === undefined) return "";
  const s = String(val).trim();
  return ["nan","nat","none","undefined","null"].includes(s.toLowerCase()) ? "" : s;
}

function safeDate(val) {
  if (!val) return null;
  try {
    if (typeof val === "number") {
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return d.toISOString().substring(0, 10) + "T00:00:00Z";
    }
    const d = new Date(val);
    if (isNaN(d)) return null;
    return d.toISOString().substring(0, 10) + "T00:00:00Z";
  } catch { return null; }
}

function detectQuarter(val) {
  const d = safeDate(val);
  if (!d) return "";
  const month = new Date(d).getMonth() + 1;
  return `Q${Math.ceil(month / 3)}`;
}

function detectYear(val) {
  const d = safeDate(val);
  if (!d) return new Date().getFullYear();
  return new Date(d).getFullYear();
}

function detectMode(days) {
  const n = parseFloat(days);
  return (!isNaN(n) && n <= 0.25) ? "Online" : "On-site";
}

// ============================================================
// INIT
// ============================================================
async function init() {
  const account = await initAuth();

  if (!account) {
    show("page-login");
    document.getElementById("btn-login").onclick = login;
    return;
  }

  document.getElementById("nav-user").textContent = account.name || account.username;
  document.getElementById("btn-logout").onclick = logout;

  show("page-app");
  hide("page-login");

  setupNav();
  setupFilters();
  setupModal();
  setupImport();
  setupAddAudit();

  await loadAudits();
}

// ============================================================
// NAWIGACJA
// ============================================================
function setupNav() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const view = btn.dataset.view;
      document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
      document.getElementById(`view-${view}`).classList.remove("hidden");
      if (view === "checkaudit") renderAuditorsTable();
    };
  });
}

// ============================================================
// ŁADOWANIE DANYCH
// ============================================================
async function loadAudits() {
  document.getElementById("audits-tbody").innerHTML =
    '<tr><td colspan="8" class="loading">Ładowanie danych...</td></tr>';
  try {
    allAudits = await fetchAllAudits();
    renderTable();
  } catch (e) {
    document.getElementById("audits-tbody").innerHTML =
      `<tr><td colspan="8" class="loading">Błąd: ${e.message}</td></tr>`;
  }
}

// ============================================================
// FILTRY
// ============================================================
function setupFilters() {
  ["search","filter-quarter","filter-year","filter-program","filter-status"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  document.getElementById("btn-clear-filters").onclick = () => {
    document.getElementById("search").value = "";
    ["filter-quarter","filter-year","filter-program","filter-status"].forEach(id => {
      document.getElementById(id).value = "";
    });
    renderTable();
  };

  document.getElementById("auditors-quarter").addEventListener("change", renderAuditorsTable);
  document.getElementById("auditors-year").addEventListener("change", renderAuditorsTable);
}

function getFilters() {
  return {
    search:  document.getElementById("search").value.toLowerCase(),
    quarter: document.getElementById("filter-quarter").value,
    year:    document.getElementById("filter-year").value,
    program: document.getElementById("filter-program").value,
    status:  document.getElementById("filter-status").value,
  };
}

function applyFilters(audits) {
  const f = getFilters();
  return audits.filter(a => {
    if (f.search  && !((a.Title || "").toLowerCase().includes(f.search))) return false;
    if (f.quarter && a.Quarter !== f.quarter) return false;
    if (f.year    && String(a.Year) !== f.year) return false;
    if (f.program && a.Program !== f.program) return false;
    if (f.status  && a.AuditStatus !== f.status) return false;
    return true;
  });
}

// ============================================================
// RENDER TABELI AUDYTÓW (tylko moje)
// ============================================================
function renderTable() {
  const myAudits = allAudits.filter(a => a.AuditorName === MY_AUDITOR);
  const filtered = applyFilters(myAudits);
  updateStats(filtered);

  const tbody = document.getElementById("audits-tbody");
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Brak wyników</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr onclick="openModal(${a.Id})" ${!a.ImportFile ? 'class="row-manual"' : ""}>
      <td class="prj-col">${a.ProjectID || "—"}</td>
      <td title="${a.Title || ""}">${a.Title || "—"}</td>
      <td>${programBadge(a.Program)}</td>
      <td>${a.AuditType ? shortType(a.AuditType) : "—"}</td>
      <td>${formatDate(a.AuditDateStart)}</td>
      <td>${a.City || "—"}</td>
      <td class="${a.AuditMode === 'Online' ? 'mode-online' : 'mode-onsite'}">${a.AuditMode === 'Online' ? '💻' : '📍'} ${a.AuditMode || "—"}</td>
      <td>${statusBadge(a.AuditStatus)}</td>
      <td>${proformaBadge(a.Proforma)}</td>
    </tr>
  `).join("");
}

function updateStats(audits) {
  document.getElementById("stat-total").textContent = audits.length;
  document.getElementById("stat-planned").textContent =
    audits.filter(a => a.AuditStatus === "PLANNED").length;
  document.getElementById("stat-done").textContent =
    audits.filter(a => a.AuditStatus === "DONE").length;
  document.getElementById("stat-proforma").textContent =
    audits.filter(a => a.AuditStatus === "DONE" && a.Proforma === "Brak").length;
}

// ============================================================
// RENDER TABELI AUDYTORÓW (check audyt)
// ============================================================
function renderAuditorsTable() {
  const q = document.getElementById("auditors-quarter").value;
  const y = document.getElementById("auditors-year").value;

  const filtered = allAudits.filter(a => {
    if (q && a.Quarter !== q) return false;
    if (y && String(a.Year) !== y) return false;
    return true;
  });

  const programs = ["FSC","PEFC","KZR INiG","SURE","EUDR"];
  const map = {};

  filtered.forEach(a => {
    const name = a.AuditorName || "—";
    if (!map[name]) { map[name] = { total: 0 }; programs.forEach(p => { map[name][p] = 0; }); }
    map[name][a.Program] = (map[name][a.Program] || 0) + 1;
    map[name].total++;
  });

  const sorted = Object.entries(map).sort((a,b) => b[1].total - a[1].total);
  const tbody = document.getElementById("auditors-tbody");

  if (!sorted.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Brak danych</td></tr>';
    return;
  }

  tbody.innerHTML = sorted.map(([name, counts]) => `
    <tr class="${name === MY_AUDITOR ? 'my-row' : ''}">
      <td>${name}${name === MY_AUDITOR ? ' ★' : ''}</td>
      ${programs.map(p => `<td>${counts[p] || "—"}</td>`).join("")}
      <td><strong>${counts.total}</strong></td>
    </tr>
  `).join("");
}

// ============================================================
// MODAL SZCZEGÓŁÓW
// ============================================================
function setupModal() {
  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("modal-overlay").onclick = e => {
    if (e.target === document.getElementById("modal-overlay")) closeModal();
  };
  document.querySelectorAll(".status-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentStatus = btn.dataset.val;
    };
  });
  document.querySelectorAll(".proforma-btn").forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll(".proforma-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentProforma = btn.dataset.val;
    };
  });
  document.getElementById("btn-save").onclick = saveChanges;
}

function openModal(id) {
  const a = allAudits.find(x => x.Id === id);
  if (!a) return;
  currentAudit = a;
  currentStatus = a.AuditStatus;
  currentProforma = a.Proforma;

  document.getElementById("modal-title").textContent = a.Title || "—";
  document.getElementById("m-prj").textContent       = a.ProjectID || "—";
  document.getElementById("m-program").textContent   = a.Program || "—";
  document.getElementById("m-type").textContent      = a.AuditType || "—";
  document.getElementById("m-standard").textContent  = (a.Standard || "—").replace(/\n/g, " | ");
  document.getElementById("m-address").textContent   = a.Address || "—";
  document.getElementById("m-city").textContent      = `${a.City || "—"} ${a.PostalCode || ""}`.trim();
  document.getElementById("m-email").textContent     = a.ClientEmail || "—";
  document.getElementById("m-phone").textContent     = a.Phone || "—";
  document.getElementById("m-mobile").textContent    = a.Mobile || "—";
  document.getElementById("m-date").textContent      = formatDate(a.AuditDateStart);
  document.getElementById("m-days").textContent      = a.AuditDays != null ? `${a.AuditDays} dni` : "—";
  document.getElementById("m-mode").textContent      = a.AuditMode || "—";
  document.getElementById("m-quarter").textContent   = a.Quarter || "—";
  document.getElementById("m-year").textContent      = a.Year || "—";
  document.getElementById("m-auditor").textContent   = a.AuditorName || "—";
  document.getElementById("m-cu").textContent        = formatDate(a.PlannedCUDate);
  document.getElementById("m-certvalid").textContent = formatDate(a.CertValidTo);
  document.getElementById("m-notes").textContent     = a.Notes || "—";

  document.querySelectorAll(".status-btn").forEach(b => b.classList.toggle("active", b.dataset.val === a.AuditStatus));
  document.querySelectorAll(".proforma-btn").forEach(b => b.classList.toggle("active", b.dataset.val === a.Proforma));

  show("modal-overlay");
}

function closeModal() {
  hide("modal-overlay");
  currentAudit = null;
}

async function saveChanges() {
  if (!currentAudit) return;
  const btn = document.getElementById("btn-save");
  btn.textContent = "Zapisywanie...";
  btn.disabled = true;
  try {
    await updateAudit(currentAudit.Id, { AuditStatus: currentStatus, Proforma: currentProforma });
    currentAudit.AuditStatus = currentStatus;
    currentAudit.Proforma    = currentProforma;
    renderTable();
    showToast("Zapisano pomyślnie", "success");
    closeModal();
  } catch (e) {
    showToast(`Błąd zapisu: ${e.message}`, "error");
  } finally {
    btn.textContent = "💾 Zapisz zmiany";
    btn.disabled = false;
  }
}

// ============================================================
// IMPORT PLIKU EXCEL (CUC)
// ============================================================
function setupImport() {
  document.getElementById("btn-import").onclick = openImportModal;
  document.getElementById("import-close").onclick = closeImport;
  document.getElementById("import-overlay").onclick = e => {
    if (e.target === document.getElementById("import-overlay")) closeImport();
  };

  const fileInput = document.getElementById("import-file");
  fileInput.onchange = e => handleFile(e.target.files[0]);

  const dropZone = document.getElementById("drop-zone");
  dropZone.ondragover = e => { e.preventDefault(); dropZone.classList.add("drag-over"); };
  dropZone.ondragleave = () => dropZone.classList.remove("drag-over");
  dropZone.ondrop = e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  };

  document.getElementById("btn-do-import").onclick = startImport;
}

function openImportModal() {
  resetImport();
  show("import-overlay");
}

function closeImport() {
  hide("import-overlay");
}

function resetImport() {
  importParsed = [];
  show("import-stage-1");
  hide("import-stage-2");
  hide("import-stage-3");
  hide("import-stage-4");
  document.getElementById("import-file").value = "";
}

function handleFile(file) {
  if (!file) return;
  if (!file.name.match(/\.xlsx?$/i)) {
    showToast("Wybierz plik .xlsx lub .xls", "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = new Uint8Array(e.target.result);
      const wb = XLSX.read(data, { type: "array", cellDates: true });

      const sheetName = wb.SheetNames.find(n => n.toLowerCase() === "worksheet") || wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { raw: false, defval: "" });

      if (!rows.length) {
        showToast("Plik jest pusty lub nie zawiera danych", "error");
        return;
      }

      importParsed = parseImportRows(rows, file.name.replace(/\.xlsx?$/i, ""));
      showImportPreview(file.name);
    } catch(err) {
      showToast(`Błąd parsowania: ${err.message}`, "error");
    }
  };
  reader.readAsArrayBuffer(file);
}

function parseImportRows(rows, filename) {
  const records = [];
  rows.forEach(row => {
    const prj = parseFloat(row["Project_ID"] || row["ProjectID"] || row["PRJ"] || "");
    if (isNaN(prj)) return;

    const days = parseFloat(row["Insp. Days"] || row["Days"] || row["DAYS"] || "");
    const start = row["Pl. St. Dt."] || row["AuditDateStart"] || row["AUDDATE"] || "";

    records.push({
      Title:          safeStr(row["Project"] || row["Name"] || row["NAME"] || row["Title"]),
      ProjectID:      Math.round(prj),
      Program:        normProgram(row["SPG. Name"] || row["Program"] || row["PROGRAM"]),
      AuditType:      normAuditType(row["Insp. Type"] || row["AuditType"] || row["TYPE"]),
      Standard:       safeStr(row["Insp. Module"] || row["Standard"] || row["STANDARD"]),
      AuditDateStart: safeDate(start),
      AuditDateEnd:   safeDate(row["Pl. End Dt."] || row["AuditDateEnd"] || ""),
      AuditDays:      isNaN(days) ? null : days,
      AuditMode:      detectMode(days),
      AuditStatus:    "PLANNED",
      Proforma:       "Brak",
      City:           safeStr(row["City"] || row["CITY"]),
      PostalCode:     safeStr(row["PostalCode"] || row["POSTCODE"]),
      Address:        safeStr(row["Address"] || row["ADDRESS"]),
      Phone:          safeStr(row["Telephone"] || row["Phone"] || row["PHONE"]),
      Mobile:         safeStr(row["Mobile"] || row["MOBILE"]),
      ClientEmail:    safeStr(row["EMail"] || row["Email"] || row["EMAIL"]),
      Notes:          safeStr(row["UWAGI"] || row["Notes"] || row["NOTES"]),
      Quarter:        detectQuarter(start),
      Year:           detectYear(start),
      AuditorName:    normAuditor(row["Lead auditor"] || row["Auditor"] || row["AUDITOR"]),
      ImportFile:     filename,
      CreatedFrom:    "WebImport",
    });
  });
  return records;
}

function showImportPreview(filename) {
  hide("import-stage-1");
  show("import-stage-2");

  const byAuditor = {};
  importParsed.forEach(r => {
    const name = r.AuditorName || "NIEZNANY";
    byAuditor[name] = (byAuditor[name] || 0) + 1;
  });

  document.getElementById("import-info").innerHTML =
    `<p>📄 <strong>${filename}</strong> — znaleziono <strong>${importParsed.length}</strong> rekordów</p>`;

  const chips = Object.entries(byAuditor)
    .sort((a,b) => b[1]-a[1])
    .map(([name, cnt]) => `
      <span class="auditor-chip ${name === MY_AUDITOR ? 'my-chip' : ''}">
        ${name === MY_AUDITOR ? '★ ' : ''}${name}: <strong>${cnt}</strong>
      </span>`)
    .join("");
  document.getElementById("import-auditors").innerHTML = chips;
  document.getElementById("import-count").textContent = importParsed.length;

  const tbody = document.getElementById("import-preview-tbody");
  tbody.innerHTML = importParsed.slice(0, 20).map(r => `
    <tr>
      <td title="${r.Title}">${r.Title || "—"}</td>
      <td>${programBadge(r.Program)}</td>
      <td>${r.AuditType ? shortType(r.AuditType) : "—"}</td>
      <td>${r.AuditDateStart ? r.AuditDateStart.substring(0,10) : "—"}</td>
      <td>${r.City || "—"}</td>
      <td>${r.AuditorName || "—"}</td>
    </tr>
  `).join("");

  if (importParsed.length > 20) {
    tbody.innerHTML += `<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:8px">… i ${importParsed.length - 20} więcej</td></tr>`;
  }
}

async function startImport() {
  if (!importParsed.length) return;
  hide("import-stage-2");
  show("import-stage-3");
  document.getElementById("btn-do-import").disabled = true;

  try {
    const existingIds = await fetchExistingProjectIds();
    let imported = 0, skipped = 0, errors = 0;
    let firstError = "";
    const total = importParsed.length;

    for (let i = 0; i < total; i++) {
      const rec = importParsed[i];
      const pct = Math.round(((i + 1) / total) * 100);
      document.getElementById("progress-fill").style.width = pct + "%";
      document.getElementById("import-progress-text").textContent =
        `Importowanie ${i+1}/${total} — ${rec.Title || ""}`;

      const dupKey = `${rec.ProjectID}_${rec.Year || ""}`;
      if (existingIds.has(dupKey)) { skipped++; continue; }

      // Wyślij tylko pola istniejące w SharePoint
      const spFields = {
        Title:          rec.Title,
        ProjectID:      rec.ProjectID,
        Program:        rec.Program,
        AuditType:      rec.AuditType,
        Standard:       rec.Standard,
        AuditDateStart: rec.AuditDateStart,
        AuditDateEnd:   rec.AuditDateEnd,
        AuditDays:      rec.AuditDays,
        AuditMode:      rec.AuditMode,
        AuditStatus:    rec.AuditStatus,
        Proforma:       rec.Proforma,
        City:           rec.City,
        PostalCode:     rec.PostalCode,
        Address:        rec.Address,
        Phone:          rec.Phone,
        Mobile:         rec.Mobile,
        ClientEmail:    rec.ClientEmail,
        Notes:          rec.Notes,
        Quarter:        rec.Quarter,
        Year:           rec.Year,
        AuditorName:    rec.AuditorName,
        ImportFile:     rec.ImportFile,
      };

      try {
        const newItem = await addAudit(spFields);
        existingIds.add(dupKey);
        imported++;
      } catch(err) {
        errors++;
        if (!firstError) firstError = err.message;
        console.error("Import error for", rec.Title, err.message);
      }
    }

    // Przeładuj dane z SharePoint
    allAudits = await fetchAllAudits();

    hide("import-stage-3");
    show("import-stage-4");

    document.getElementById("import-results").innerHTML = `
      <div class="import-result-box">
        <div class="result-item success">✅ Zaimportowano: <strong>${imported}</strong></div>
        <div class="result-item skip">⏭ Pominięto (duplikaty): <strong>${skipped}</strong></div>
        ${errors ? `<div class="result-item error">❌ Błędy: <strong>${errors}</strong>${firstError ? `<br><small style="font-size:11px;opacity:.8">${firstError}</small>` : ""}</div>` : ""}
      </div>
    `;

    renderTable();
    renderAuditorsTable();
    showToast(`Import zakończony: +${imported} audytów`, imported > 0 ? "success" : "info");

  } catch(e) {
    showToast(`Błąd importu: ${e.message}`, "error");
    hide("import-stage-3");
    show("import-stage-2");
  } finally {
    document.getElementById("btn-do-import").disabled = false;
  }
}

// ============================================================
// DODAJ NIEPLANOWANY AUDYT
// ============================================================
function setupAddAudit() {
  document.getElementById("btn-add-audit").onclick = openAddAuditModal;
  document.getElementById("add-audit-close").onclick = closeAddAudit;
  document.getElementById("add-audit-overlay").onclick = e => {
    if (e.target === document.getElementById("add-audit-overlay")) closeAddAudit();
  };
  document.getElementById("btn-save-new-audit").onclick = saveNewAudit;

  document.getElementById("new-date").addEventListener("change", e => {
    const val = e.target.value;
    if (val) {
      document.getElementById("new-quarter").value = detectQuarter(val);
      document.getElementById("new-year").value = detectYear(val);
    }
  });

  document.getElementById("new-days").addEventListener("change", e => {
    const days = parseFloat(e.target.value);
    document.getElementById("new-mode").value = (!isNaN(days) && days <= 0.25) ? "Online" : "On-site";
  });

  setupFirmaAutocomplete();
}

// ============================================================
// AUTOCOMPLETE — pole Firma
// ============================================================
function setupFirmaAutocomplete() {
  const input = document.getElementById("new-title");
  const list  = document.getElementById("autocomplete-list");
  let activeIdx = -1;

  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = "";
    activeIdx = -1;

    if (q.length < 3) { list.classList.add("hidden"); return; }

    // Unikalne firmy z bazy posortowane alfabetycznie
    const names = [...new Set(allAudits.map(a => a.Title).filter(Boolean))]
      .filter(n => n.toLowerCase().includes(q))
      .sort((a, b) => {
        // Firmy zaczynające się od zapytania na górze
        const aStart = a.toLowerCase().startsWith(q);
        const bStart = b.toLowerCase().startsWith(q);
        if (aStart && !bStart) return -1;
        if (!aStart && bStart) return 1;
        return a.localeCompare(b, "pl");
      })
      .slice(0, 10);

    if (!names.length) { list.classList.add("hidden"); return; }

    names.forEach((name, i) => {
      const li = document.createElement("li");
      // Podświetl pasujący fragment
      const idx = name.toLowerCase().indexOf(q);
      li.innerHTML = name.substring(0, idx)
        + `<strong>${name.substring(idx, idx + q.length)}</strong>`
        + name.substring(idx + q.length);
      li.addEventListener("mousedown", e => {
        e.preventDefault();
        selectFirma(name);
      });
      list.appendChild(li);
    });

    list.classList.remove("hidden");
  });

  // Nawigacja strzałkami + Enter
  input.addEventListener("keydown", e => {
    const items = list.querySelectorAll("li");
    if (!items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, items.length - 1);
      items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      items.forEach((li, i) => li.classList.toggle("active", i === activeIdx));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      selectFirma(items[activeIdx].textContent);
    } else if (e.key === "Escape") {
      list.classList.add("hidden");
    }
  });

  input.addEventListener("blur", () => {
    setTimeout(() => list.classList.add("hidden"), 150);
  });
}

function selectFirma(name) {
  document.getElementById("new-title").value = name;
  document.getElementById("autocomplete-list").classList.add("hidden");

  // Auto-uzupełnij dane z ostatniego audytu tej firmy
  const last = allAudits
    .filter(a => a.Title === name && a.AuditDateStart)
    .sort((a, b) => (b.AuditDateStart || "").localeCompare(a.AuditDateStart || ""))
    [0];

  if (last) {
    if (last.Program)     document.getElementById("new-program").value = last.Program;
    if (last.Standard)    document.getElementById("new-standard").value = last.Standard;
    if (last.City)        document.getElementById("new-city").value = last.City;
    if (last.ClientEmail) document.getElementById("new-email").value = last.ClientEmail;
  }
}

function openAddAuditModal() {
  ["new-title","new-standard","new-city","new-email","new-notes"].forEach(id => {
    document.getElementById(id).value = "";
  });
  document.getElementById("new-program").value = "";
  document.getElementById("new-type").value = "";
  document.getElementById("new-date").value = "";
  document.getElementById("new-days").value = "1";
  document.getElementById("new-mode").value = "On-site";
  document.getElementById("new-quarter").value = "";
  document.getElementById("new-year").value = new Date().getFullYear();
  document.getElementById("new-status").value = "PLANNED";
  show("add-audit-overlay");
}

function closeAddAudit() {
  hide("add-audit-overlay");
}

async function saveNewAudit() {
  const title   = document.getElementById("new-title").value.trim();
  const program = document.getElementById("new-program").value;
  const type    = document.getElementById("new-type").value;
  const date    = document.getElementById("new-date").value;

  if (!title)   { showToast("Podaj nazwę firmy", "error"); return; }
  if (!program) { showToast("Wybierz program", "error"); return; }
  if (!type)    { showToast("Wybierz typ audytu", "error"); return; }
  if (!date)    { showToast("Podaj datę audytu", "error"); return; }

  const days = parseFloat(document.getElementById("new-days").value) || 1;
  const quarter = document.getElementById("new-quarter").value || detectQuarter(date);

  const rec = {
    Title:          title,
    Program:        program,
    AuditType:      type,
    Standard:       document.getElementById("new-standard").value.trim(),
    AuditDateStart: safeDate(date),
    AuditDays:      days,
    AuditMode:      document.getElementById("new-mode").value,
    AuditStatus:    document.getElementById("new-status").value,
    Proforma:       "Brak",
    City:           document.getElementById("new-city").value.trim(),
    ClientEmail:    document.getElementById("new-email").value.trim(),
    Quarter:        quarter,
    Year:           parseInt(document.getElementById("new-year").value) || new Date().getFullYear(),
    AuditorName:    MY_AUDITOR,
    Notes:          document.getElementById("new-notes").value.trim(),
  };

  const btn = document.getElementById("btn-save-new-audit");
  btn.textContent = "Zapisywanie...";
  btn.disabled = true;

  try {
    const newItem = await addAudit(rec);
    allAudits.push({ ...rec, Id: newItem?.Id || Date.now() });
    renderTable();
    showToast("Audyt dodany pomyślnie", "success");
    closeAddAudit();
  } catch(e) {
    showToast(`Błąd: ${e.message}`, "error");
  } finally {
    btn.textContent = "💾 Zapisz audyt";
    btn.disabled = false;
  }
}

// ============================================================
// HELPERS
// ============================================================
function formatDate(val) {
  if (!val) return "—";
  try { return new Date(val).toLocaleDateString("pl-PL"); }
  catch { return val; }
}

function shortType(t) {
  const map = {
    "Surveillance announced": "Surveillance",
    "Re-assessment":          "Re-assess.",
    "Re-Certification Audit": "Re-Cert.",
    "Certification Audit":    "Certif.",
    "Extension Audit":        "Extension",
  };
  return map[t] || t;
}

function programBadge(p) {
  const cls = { FSC:"fsc", PEFC:"pefc", "KZR INiG":"kzr", SURE:"sure", EUDR:"eudr" };
  return `<span class="badge badge-${cls[p] || 'fsc'}">${p || "—"}</span>`;
}

function statusBadge(s) {
  const cls = { PLANNED:"planned", DONE:"done", REJECTED:"rejected", CHANGE:"change", Invoice:"invoice" };
  return `<span class="badge badge-${cls[s] || 'planned'}">${s || "—"}</span>`;
}

function proformaBadge(p) {
  const map = { "Brak":"brak", "Wysłana":"wysłana", "Zapłacona":"zapłacona" };
  return `<span class="badge badge-proforma-${map[p] || 'brak'}">${p || "Brak"}</span>`;
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 3500);
}

// ============================================================
// START
// ============================================================
init();
