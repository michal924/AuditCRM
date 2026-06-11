// ============================================================
// Audit CRM — Main Application
// ============================================================

const MY_AUDITOR = "Rzeźnik Michał";

let allAudits = [];
let currentAudit = null;
let currentStatus = null;
let currentProforma = null;
let importParsed = [];
let sortCol = "PlannedCUDate";
let sortDir = 1; // 1 = ASC, -1 = DESC
let isEditMode = false;
let originalAuditDate = null;  // śledzi oryginał daty AuditDateStart przy wejściu w tryb edycji
let planAuditRequested = false; // true tylko gdy użytkownik świadomie kliknął "Zaplanuj audyt"

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
  "fsc chain of custody (coc)": "FSC CoC",
  "pefc - chain of custody":    "PEFC CoC",
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
  setupChanges();

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
      if (view === "changes") renderChangesTable();
      if (view === "opieka") OpiekaModule.render();
      if (view === "mapa")   MapModule.render();
    };
  });
}

// ============================================================
// ŁADOWANIE DANYCH
// ============================================================
async function loadAudits() {
  document.getElementById("audits-tbody").innerHTML =
    '<tr><td colspan="10" class="loading">Ładowanie danych...</td></tr>';
  try {
    allAudits = await fetchAllAudits();
    renderTable();
  } catch (e) {
    document.getElementById("audits-tbody").innerHTML =
      `<tr><td colspan="8" class="loading">Błąd: ${e.message}</td></tr>`;
  }
}

// ============================================================
// FILTRY — z persystencją w localStorage
// ============================================================
const FILTERS_KEY = "auditFilters_v3";
const MULTI_KEYS  = ["quarter", "year", "program", "status"];
const MULTI_LABELS = { quarter: "Kwartał", year: "Rok", program: "Program", status: "Status" };

function getSelectedMulti(key) {
  return [...document.querySelectorAll(`#filter-${key}-panel input[type=checkbox]:checked`)].map(cb => cb.value);
}

function updateMultiBtn(key) {
  const sel = getSelectedMulti(key);
  const btn = document.getElementById(`filter-${key}-btn`);
  if (!btn) return;
  const label = MULTI_LABELS[key];
  btn.textContent = sel.length === 0 ? label : sel.length === 1 ? sel[0] : `${label} (${sel.length})`;
  btn.classList.toggle("filter-multi-active", sel.length > 0);
}

function saveFilters() {
  const state = { search: document.getElementById("search").value };
  MULTI_KEYS.forEach(key => { state[key] = getSelectedMulti(key); });
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(state)); } catch {}
}

function restoreFilters() {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return;
    const state = JSON.parse(raw);
    const search = document.getElementById("search");
    if (search && state.search !== undefined) search.value = state.search;
    MULTI_KEYS.forEach(key => {
      if (!Array.isArray(state[key])) return;
      document.querySelectorAll(`#filter-${key}-panel input[type=checkbox]`).forEach(cb => {
        cb.checked = state[key].includes(cb.value);
      });
      updateMultiBtn(key);
    });
  } catch {}
}

function setupFilters() {
  restoreFilters();

  document.getElementById("search").addEventListener("input", () => { saveFilters(); renderTable(); });

  // Wspólny setup dla wszystkich multi-select filtrów
  MULTI_KEYS.forEach(key => {
    const btn   = document.getElementById(`filter-${key}-btn`);
    const panel = document.getElementById(`filter-${key}-panel`);
    btn.addEventListener("click", e => {
      e.stopPropagation();
      // Zamknij pozostałe panele
      MULTI_KEYS.forEach(k => { if (k !== key) document.getElementById(`filter-${k}-panel`).classList.add("hidden"); });
      panel.classList.toggle("hidden");
    });
    panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
      cb.addEventListener("change", () => { updateMultiBtn(key); saveFilters(); renderTable(); });
    });
  });

  // Klik poza dropdownem zamyka wszystkie
  document.addEventListener("click", e => {
    if (!e.target.closest(".filter-multi-wrap")) {
      MULTI_KEYS.forEach(key => { document.getElementById(`filter-${key}-panel`).classList.add("hidden"); });
    }
  });

  document.getElementById("btn-clear-filters").onclick = () => {
    document.getElementById("search").value = "";
    MULTI_KEYS.forEach(key => {
      document.querySelectorAll(`#filter-${key}-panel input[type=checkbox]`).forEach(cb => { cb.checked = false; });
      updateMultiBtn(key);
    });
    saveFilters();
    renderTable();
  };

  document.getElementById("auditors-quarter").addEventListener("change", renderAuditorsTable);
  document.getElementById("auditors-year").addEventListener("change", renderAuditorsTable);
}

function getFilters() {
  return {
    search:   document.getElementById("search").value.toLowerCase(),
    quarters: getSelectedMulti("quarter"),
    years:    getSelectedMulti("year"),
    programs: getSelectedMulti("program"),
    statuses: getSelectedMulti("status"),
  };
}

// Normalizuj program do porównania (FSC CoC ↔ FSC, PEFC CoC ↔ PEFC)
function normProgramKey(p) {
  if (!p) return "";
  return p.replace(/\s*CoC$/i, "").trim().toUpperCase();
}

function applyFilters(audits) {
  const f = getFilters();
  return audits.filter(a => {
    if (f.search       && !((a.Title || "").toLowerCase().includes(f.search))) return false;
    if (f.quarters.length > 0 && !f.quarters.includes(a.Quarter)) return false;
    if (f.years.length > 0    && !f.years.includes(String(a.Year))) return false;
    if (f.programs.length > 0 && !f.programs.some(p => normProgramKey(p) === normProgramKey(a.Program))) return false;
    if (f.statuses.length > 0 && !f.statuses.includes(a.AuditStatus)) return false;
    return true;
  });
}

// ============================================================
// RENDER TABELI AUDYTÓW (tylko moje)
// ============================================================
function sortAudits(arr) {
  return [...arr].sort((a, b) => {
    let va = a[sortCol] ?? "";
    let vb = b[sortCol] ?? "";
    // Daty: string ISO — porównuj leksykograficznie
    if (typeof va === "string") va = va.toLowerCase();
    if (typeof vb === "string") vb = vb.toLowerCase();
    if (va < vb) return -1 * sortDir;
    if (va > vb) return  1 * sortDir;
    return 0;
  });
}

function setSort(col) {
  if (sortCol === col) {
    sortDir = -sortDir;
  } else {
    sortCol = col;
    sortDir = 1;
  }
  renderTable();
}

function renderSortIcons() {
  document.querySelectorAll("#audits-table thead th[data-sort]").forEach(th => {
    const col = th.dataset.sort;
    const base = th.dataset.label || th.textContent.replace(/[↑↓ ]/g, "").trim();
    th.textContent = base + (sortCol === col ? (sortDir === 1 ? " ↑" : " ↓") : "");
  });
}

function renderTable() {
  const myAudits = allAudits.filter(a => a.AuditorName === MY_AUDITOR);
  const filtered = sortAudits(applyFilters(myAudits));
  updateStats(filtered);
  renderSortIcons();

  const tbody = document.getElementById("audits-tbody");
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="loading">Brak wyników</td></tr>';
    return;
  }

  const NCOLS = 11; // liczba kolumn tabeli
  tbody.innerHTML = filtered.map(a => {
    const rowClass = !a.ImportFile ? "row-manual" : "";
    const notesSnippet = a.Notes
      ? '<span class="notes-preview">' + escHtml(a.Notes.length > 50 ? a.Notes.substring(0,50)+'…' : a.Notes) + '</span>'
      : '<span class="notes-empty">—</span>';
    const custodyMark = custodyBadge(a);
    const aid = a.Id;
    const notesBlock = a.Notes
      ? '<div class="rp-notes"><span class="rp-label">Notatki</span><p class="rp-notes-text">' + escHtml(a.Notes).replace(/\n/g,'<br>') + '</p></div>'
      : '';
    const emailBlock = a.Email
      ? '<a href="mailto:' + escHtml(a.Email) + '">' + escHtml(a.Email) + '</a>'
      : '—';
    return '' +
    '<tr class="audit-row ' + rowClass + '" data-id="' + aid + '" onclick="toggleRowPreview(' + aid + ', this)">' +
      '<td class="prj-col">' + escHtml(a.ProjectID || '—') + '</td>' +
      '<td class="firma-col">' + escHtml(a.Title || '—') + '</td>' +
      '<td class="program-col">' + programBadge(a.Program) + '</td>' +
      '<td>' + (a.AuditType ? shortType(a.AuditType) : '—') + '</td>' +
      '<td class="date-col">' + (formatDate(a.PlannedCUDate) || '—') + '</td>' +
      '<td class="date-col">' + formatDate(a.AuditDateStart) + custodyMark + '</td>' +
      '<td>' + escHtml(a.City || '—') + '</td>' +
      '<td class="' + (a.AuditMode === 'Online' ? 'mode-online' : 'mode-onsite') + '">' + (a.AuditMode === 'Online' ? '💻' : '📍') + ' ' + (a.AuditMode || '—') + '</td>' +
      '<td>' + statusBadge(a.AuditStatus) + '</td>' +
      '<td>' + proformaBadge(a.Proforma) + '</td>' +
      '<td class="notes-col">' + notesSnippet + '</td>' +
    '</tr>' +
    '<tr class="row-preview-wrap" id="preview-' + aid + '" style="display:none">' +
      '<td colspan="' + NCOLS + '" class="row-preview-td">' +
        '<div class="row-preview">' +
          '<div class="row-preview-grid">' +
            '<div class="rp-item"><span class="rp-label">Firma</span><span class="rp-val">' + escHtml(a.Title || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">PRJ</span><span class="rp-val">' + escHtml(a.ProjectID || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Program</span><span class="rp-val">' + programBadge(a.Program) + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Typ</span><span class="rp-val">' + escHtml(a.AuditType || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Status</span><span class="rp-val">' + statusBadge(a.AuditStatus) + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Proforma</span><span class="rp-val">' + proformaBadge(a.Proforma) + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Data CU</span><span class="rp-val">' + (formatDate(a.PlannedCUDate) || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Data audytu LF</span><span class="rp-val">' + (formatDate(a.AuditDateStart) || '—') + custodyMark + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Miasto</span><span class="rp-val">' + escHtml(a.City || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Tryb</span><span class="rp-val">' + escHtml(a.AuditMode || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Audytor</span><span class="rp-val">' + escHtml(a.AuditorName || '—') + '</span></div>' +
            '<div class="rp-item"><span class="rp-label">Email</span><span class="rp-val">' + emailBlock + '</span></div>' +
          '</div>' +
          notesBlock +
          '<div class="rp-actions">' +
            '<button class="btn-rp-edit" onclick="event.stopPropagation(); openModal(' + aid + ')">✏️ Edytuj</button>' +
            '<button class="btn-rp-close" onclick="event.stopPropagation(); toggleRowPreview(' + aid + ')">✕ Zamknij</button>' +
          '</div>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join("");
}

// Znacznik kolizji z opieką nad Szymonem — tylko dla audytów Rzeźnik Michał
function custodyBadge(a) {
  try {
    if (a.AuditorName !== MY_AUDITOR || !a.AuditDateStart) return "";
    if (!window.OpiekaModule || !window.OpiekaModule.dayInfo) return "";
    const info = window.OpiekaModule.dayInfo(a.AuditDateStart);
    if (!info.father) return "";
    return ` <span class="op-conflict" title="Opieka nad Szymonem: ${info.reason} — sprawdź dostępność">👨‍👦</span>`;
  } catch { return ""; }
}

// Pokaż/ukryj ikonę dziecka przy dacie (formularz, szczegóły audytu)
function setDateCustodyIcon(iconId, dateVal, auditorName) {
  const elIcon = document.getElementById(iconId);
  if (!elIcon) return;
  let show = false, reason = "";
  try {
    const auditorOk = !auditorName || auditorName === MY_AUDITOR;
    if (auditorOk && dateVal && window.OpiekaModule && window.OpiekaModule.dayInfo) {
      const info = window.OpiekaModule.dayInfo(dateVal);
      show = info.father; reason = info.reason;
    }
  } catch {}
  if (show) {
    elIcon.title = `Opieka nad Szymonem: ${reason}`;
    elIcon.classList.remove("hidden");
  } else {
    elIcon.classList.add("hidden");
  }
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
    const progKey = normProgramKey(a.Program); // normalizuj: "FSC CoC" → "FSC"
    if (map[name][progKey] !== undefined) map[name][progKey]++;
    else map[name][progKey] = 1;
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
  document.getElementById("btn-edit-audit").onclick = enterEditMode;
  document.getElementById("btn-cancel-edit").onclick = cancelEditMode;

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

  // Zmiana daty w trybie edycji → aktualizuj kwartał i rok
  document.getElementById("e-date").addEventListener("change", e => {
    const val = e.target.value;
    if (val) {
      document.getElementById("m-quarter").textContent = detectQuarter(val);
      document.getElementById("m-year").textContent    = detectYear(val);
      setDateCustodyIcon("m-date-icon", val, currentAudit ? currentAudit.AuditorName : null);
    }
    updatePlanAuditBtn(val);
  });

  document.getElementById("btn-plan-audit").addEventListener("click", () => {
    // Ustaw status na PLANNED i zaznacz że użytkownik chce wysłać zaproszenie
    const dateVal = document.getElementById("e-date").value;
    if (!dateVal) {
      showToast("Najpierw wpisz datę audytu LF", "warn");
      document.getElementById("e-date").focus();
      return;
    }
    planAuditRequested = true;
    // Ustaw status na PLANNED jeśli jeszcze nie jest
    currentStatus = "PLANNED";
    document.querySelectorAll(".status-btn").forEach(b => b.classList.toggle("active", b.dataset.val === "PLANNED"));
    const btn = document.getElementById("btn-plan-audit");
    btn.classList.add("scheduled");
    btn.textContent = "📅 Zaplanowano — wyślij zaproszenie";
    btn.title = `Przy zapisaniu wyślij zaproszenie (${formatDate(dateVal)}) do office@logisticfit.com i michal@logisticfit.com`;
    showToast("📅 Gotowe — kliknij Zapisz aby wysłać zaproszenie do kalendarzy", "success");
  });
}

function updatePlanAuditBtn(dateVal) {
  const btn = document.getElementById("btn-plan-audit");
  if (!btn) return;
  if (dateVal && dateVal !== originalAuditDate) {
    btn.classList.add("scheduled");
    btn.title = `Przy zapisaniu — wyślij zaproszenie (${formatDate(dateVal)}) do kalendarzy office@logisticfit.com i michal@logisticfit.com`;
  } else {
    btn.classList.remove("scheduled");
    btn.title = "Przy zapisaniu daty — wyślij zaproszenie do kalendarzy office@logisticfit.com i michal@logisticfit.com";
  }
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
  const cityFull = `${a.City || ""} ${a.PostalCode || ""}`.trim();
  document.getElementById("m-city").textContent      = cityFull || "—";

  // Link do trasy w mapach
  const mapsLink = document.getElementById("m-maps-link");
  const addrParts = [a.Address, a.City, a.PostalCode].filter(Boolean);
  if (addrParts.length) {
    const q = encodeURIComponent(addrParts.join(", "));
    const isApple = /iPad|iPhone|Macintosh/.test(navigator.userAgent) && !window.MSStream;
    mapsLink.href = isApple
      ? `https://maps.apple.com/?daddr=${q}`
      : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
    mapsLink.classList.remove("hidden");
  } else {
    mapsLink.classList.add("hidden");
  }
  document.getElementById("m-email").textContent     = a.ClientEmail || "—";
  document.getElementById("m-phone").textContent     = a.Phone || "—";
  document.getElementById("m-mobile").textContent    = a.Mobile || "—";
  document.getElementById("m-date").textContent      = formatDate(a.AuditDateStart);
  setDateCustodyIcon("m-date-icon", a.AuditDateStart, a.AuditorName);
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

function enterEditMode() {
  if (!currentAudit) return;
  const a = currentAudit;
  isEditMode = true;
  originalAuditDate = a.AuditDateStart ? a.AuditDateStart.substring(0, 10) : "";
  document.getElementById("e-address").value = a.Address || "";
  document.getElementById("e-city").value    = a.City || "";
  document.getElementById("e-postal").value  = a.PostalCode || "";
  document.getElementById("e-email").value   = a.ClientEmail || "";
  document.getElementById("e-phone").value   = a.Phone || "";
  document.getElementById("e-mobile").value  = a.Mobile || "";
  document.getElementById("e-date").value    = originalAuditDate;
  document.getElementById("e-days").value    = a.AuditDays != null ? a.AuditDays : "";
  document.getElementById("e-mode").value    = a.AuditMode || "On-site";
  document.getElementById("e-cu").value      = a.PlannedCUDate ? a.PlannedCUDate.substring(0, 10) : "";
  document.getElementById("e-notes").value   = a.Notes || "";
  document.getElementById("modal-overlay").classList.add("edit-mode");
  updatePlanAuditBtn(originalAuditDate);
}

function cancelEditMode() {
  isEditMode = false;
  originalAuditDate = null;
  document.getElementById("modal-overlay").classList.remove("edit-mode");
  // Przywróć link mapy jeśli jest adres
  const a = currentAudit;
  if (a && [a.Address, a.City, a.PostalCode].some(Boolean)) {
    document.getElementById("m-maps-link").classList.remove("hidden");
  }
  const btn = document.getElementById("btn-plan-audit");
  if (btn) btn.classList.remove("scheduled");
}

function closeModal() {
  hide("modal-overlay");
  if (isEditMode) {
    isEditMode = false;
    document.getElementById("modal-overlay").classList.remove("edit-mode");
  }
  currentAudit = null;
  planAuditRequested = false; // reset flagi przy zamknięciu modalu (Anuluj / klik poza)
}

async function saveChanges() {
  if (!currentAudit) return;
  const btn = document.getElementById("btn-save");
  btn.textContent = "Zapisywanie...";
  btn.disabled = true;
  try {
    const prevStatus = currentAudit.AuditStatus;
    const fields = { AuditStatus: currentStatus, Proforma: currentProforma };

    if (isEditMode) {
      const dateVal = document.getElementById("e-date").value;
      const cuVal   = document.getElementById("e-cu").value;
      fields.Address       = document.getElementById("e-address").value.trim() || null;
      fields.City          = document.getElementById("e-city").value.trim()    || null;
      fields.PostalCode    = document.getElementById("e-postal").value.trim()  || null;
      fields.ClientEmail   = document.getElementById("e-email").value.trim()   || null;
      fields.Phone         = document.getElementById("e-phone").value.trim()   || null;
      fields.Mobile        = document.getElementById("e-mobile").value.trim()  || null;
      fields.AuditDateStart = dateVal ? safeDate(dateVal) : null;
      const daysVal = document.getElementById("e-days").value;
      fields.AuditDays     = daysVal !== "" ? parseFloat(daysVal) : null;
      fields.AuditMode     = document.getElementById("e-mode").value || null;
      fields.PlannedCUDate = cuVal ? safeDate(cuVal) : null;
      fields.Notes         = document.getElementById("e-notes").value.trim()   || null;
      if (dateVal) {
        fields.Quarter = detectQuarter(dateVal);
        fields.Year    = detectYear(dateVal);
      }
    }

    await updateAudit(currentAudit.Id, fields);
    Object.assign(currentAudit, fields);
    renderTable();

    // ── Integracja kalendarza: TYLKO gdy użytkownik kliknął "Zaplanuj audyt" i status = PLANNED ──
    if (planAuditRequested && currentStatus === "PLANNED" && currentAudit.AuditDateStart) {
      try {
        const calResult = await createAuditCalendarEvents(currentAudit);
        const link = calResult?.webLink;
        showToast("💾 Zapisano + 📅 Zaproszenie wysłane!" + (link ? " (sprawdź konsolę F12)" : ""), "success");
        if (link) console.log("[Calendar] Otwórz event:", link);
      } catch (calErr) {
        console.error("Błąd kalendarza:", calErr);
        showToast("💾 Zapisano. ⚠️ Błąd wysyłania zaproszenia: " + calErr.message.substring(0, 80), "warn");
      }
    } else {
      showToast("Zapisano pomyślnie", "success");
    }
    planAuditRequested = false; // zawsze resetuj flagę po zapisie

    closeModal();
  } catch (e) {
    showToast(`Błąd zapisu: ${e.message}`, "error");
  } finally {
    btn.textContent = "💾 Zapisz zmiany";
    btn.disabled = false;
  }
}

// ============================================================
// INTEGRACJA MICROSOFT CALENDAR (Graph API)
// ============================================================
async function createCalendarEvent(audit) {
  const token = await getGraphToken();
  const dateStr  = audit.AuditDateStart.substring(0, 10);
  const nextDate = new Date(dateStr + "T12:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextStr  = nextDate.toISOString().substring(0, 10);

  const loc  = [audit.Address, audit.City, audit.PostalCode].filter(Boolean).join(", ");
  const subj = `🔍 Audyt ${audit.Program || ""}: ${audit.Title || ""}${audit.City ? " — " + audit.City : ""}`.trim();

  const body = [
    `PRJ: ${audit.ProjectID || "—"}`,
    `Program: ${audit.Program || "—"}`,
    `Typ: ${audit.AuditType || "—"}`,
    `Audytor: ${audit.AuditorName || "—"}`,
    `Adres: ${loc || "—"}`,
  ].join("\n");

  const event = {
    subject: subj,
    isAllDay: true,
    start: { dateTime: `${dateStr}T00:00:00`, timeZone: "Europe/Warsaw" },
    end:   { dateTime: `${nextStr}T00:00:00`,  timeZone: "Europe/Warsaw" },
    showAs: "busy",
    body:  { contentType: "text", content: body },
    categories: ["Audyt LogisticFit"],
  };

  const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`Graph ${r.status}: ${err.substring(0, 150)}`);
  }
  return r.json();
}

// ============================================================
// ZAPLANUJ AUDYT — wysyłka do kalendarzy office@ + michal@
// Tworzy wydarzenie w kalendarzu Michała z office@ jako uczestnikiem
// (office@ otrzymuje e-mail z zaproszeniem do kalendarza)
// ============================================================
async function createAuditCalendarEvents(audit) {
  const token = await getGraphToken();
  if (!token) throw new Error("Brak tokenu Graph — zaloguj się ponownie");

  const dateStr  = audit.AuditDateStart.substring(0, 10);
  const nextDate = new Date(dateStr + "T12:00:00");
  nextDate.setDate(nextDate.getDate() + 1);
  const nextStr  = nextDate.toISOString().substring(0, 10);

  const loc  = [audit.Address, audit.City, audit.PostalCode].filter(Boolean).join(", ");
  const subj = `📅 Audyt ${audit.Program || ""}: ${audit.Title || ""}${audit.City ? " — " + audit.City : ""}`.trim();

  const bodyText = [
    `PRJ: ${audit.ProjectID || "—"}`,
    `Program: ${audit.Program || "—"}`,
    `Typ: ${audit.AuditType || "—"}`,
    `Audytor: ${audit.AuditorName || "—"}`,
    `Adres: ${loc || "—"}`,
    ``,
    `Zaplanowano przez Audit CRM — LogisticFit`,
  ].join("\n");

  const event = {
    subject: subj,
    isAllDay: true,
    start: { dateTime: `${dateStr}T00:00:00`, timeZone: "Europe/Warsaw" },
    end:   { dateTime: `${nextStr}T00:00:00`, timeZone: "Europe/Warsaw" },
    showAs: "busy",
    body:  { contentType: "text", content: bodyText },
    categories: ["Audyt LogisticFit"],
    attendees: [
      {
        emailAddress: { address: "office@logisticfit.com", name: "LogisticFit Office" },
        type: "required",
      },
    ],
  };

  console.log("[Calendar] Tworzę event:", subj, dateStr, "→", nextStr);

  const r = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(event),
  });

  const responseText = await r.text();
  console.log("[Calendar] Graph response status:", r.status);

  if (!r.ok) {
    console.error("[Calendar] Graph error body:", responseText);
    throw new Error(`Graph ${r.status}: ${responseText.substring(0, 200)}`);
  }

  let created;
  try { created = JSON.parse(responseText); } catch(e) { created = {}; }

  console.log("[Calendar] Event ID:", created.id);
  console.log("[Calendar] webLink:", created.webLink);
  console.log("[Calendar] organizer:", JSON.stringify(created.organizer));
  console.log("[Calendar] calendar:", JSON.stringify(created.calendar));

  return created;
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

    const days  = parseFloat(row["Insp. Days"] || row["Days"] || row["DAYS"] || "");
    // Data CU = data planowana przez CUC (z pliku Excel)
    const cuDate = row["Pl. St. Dt."] || row["AuditDateStart"] || row["AUDDATE"] || "";

    records.push({
      Title:          safeStr(row["Project"] || row["Name"] || row["NAME"] || row["Title"]),
      ProjectID:      Math.round(prj),
      Program:        normProgram(row["SPG. Name"] || row["Program"] || row["PROGRAM"]),
      AuditType:      normAuditType(row["Insp. Type"] || row["AuditType"] || row["TYPE"]),
      Standard:       safeStr(row["Insp. Module"] || row["Standard"] || row["STANDARD"]),
      // AuditDateStart = Data audytu LF — nigdy nie wypełniamy z importu, ustawia Michał ręcznie
      AuditDateStart: null,
      AuditDateEnd:   null,
      // PlannedCUDate = Data CU — data z pliku CUC
      PlannedCUDate:  safeDate(cuDate),
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
      // Kwartał i rok z daty CUC (bo to jest planowanie)
      Quarter:        detectQuarter(cuDate),
      Year:           detectYear(cuDate),
      AuditorName:    normAuditor(row["Lead auditor"] || row["Auditor"] || row["AUDITOR"]),
      ImportFile:     filename,
      CreatedFrom:    "WebImport",
    });
  });
  return records;
}

// Wykryj dominujący Kwartał+Rok z parsowanego pliku
function detectImportQuarterYear() {
  const counts = {};
  importParsed.forEach(r => {
    const k = `${r.Quarter || ""}|${r.Year || ""}`;
    counts[k] = (counts[k] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a,b) => b[1]-a[1])[0];
  if (!best) return null;
  const [q, y] = best[0].split("|");
  return { quarter: q, year: y };
}

// Oblicz diff między istniejącymi rekordami importowanymi a nowym plikiem
function computeReimportDiff(existingImported) {
  const newKeys = new Set(importParsed.map(r => `${r.ProjectID}_${r.Year||""}_${r.Program||""}`));

  const toDelete = [];   // istniejące, których nie ma w nowym pliku — kandydaci do usunięcia
  const protected_ = []; // istniejące, których nie ma w nowym pliku, ale mają dane ręczne

  existingImported.forEach(ex => {
    const key = `${parseInt(ex.ProjectID)}_${ex.Year||""}_${ex.Program||""}`;
    if (!newKeys.has(key)) {
      const hasManualData = ex.AuditDateStart || (ex.AuditStatus && ex.AuditStatus !== "PLANNED");
      if (hasManualData) {
        protected_.push(ex);
      } else {
        toDelete.push(ex);
      }
    }
  });

  const existingKeys = new Set(existingImported.map(ex =>
    `${parseInt(ex.ProjectID)}_${ex.Year||""}_${ex.Program||""}`
  ));
  const toAdd = importParsed.filter(r => {
    const key = `${r.ProjectID}_${r.Year||""}_${r.Program||""}`;
    return !existingKeys.has(key);
  });

  return { toDelete, protected_, toAdd };
}

let reimportDiff = null; // wynik diff przechowywany między preview a startImport

function showImportPreview(filename) {
  hide("import-stage-1");
  show("import-stage-2");
  reimportDiff = null;

  const byAuditor = {};
  importParsed.forEach(r => {
    const name = r.AuditorName || "NIEZNANY";
    byAuditor[name] = (byAuditor[name] || 0) + 1;
  });

  const chips = Object.entries(byAuditor)
    .sort((a,b) => b[1]-a[1])
    .map(([name, cnt]) =>
      '<span class="auditor-chip ' + (name === MY_AUDITOR ? 'my-chip' : '') + '">' +
      (name === MY_AUDITOR ? '★ ' : '') + escHtml(name) + ': <strong>' + cnt + '</strong></span>'
    ).join("");
  document.getElementById("import-auditors").innerHTML = chips;

  // Sprawdź czy to re-import tego samego Q+Y
  const qy = detectImportQuarterYear();
  let infoHtml = '<p>📄 <strong>' + escHtml(filename) + '</strong> — znaleziono <strong>' + importParsed.length + '</strong> rekordów</p>';

  if (qy && qy.quarter && qy.year) {
    const existingForQY = allAudits.filter(a =>
      a.Quarter === qy.quarter && String(a.Year) === String(qy.year) && a.ImportFile
    );
    if (existingForQY.length > 0) {
      const diff = computeReimportDiff(existingForQY);
      reimportDiff = diff;
      const deleteCount = diff.toDelete.length;
      const protectCount = diff.protected_.length;
      const addCount = diff.toAdd.length;
      const skipCount = importParsed.length - addCount;

      infoHtml += '<div class="import-reimport-info">' +
        '<div class="reimport-title">🔄 Re-import ' + escHtml(qy.quarter) + ' ' + escHtml(qy.year) + ' — wykryto zmiany względem poprzedniego importu:</div>' +
        '<div class="reimport-stats">' +
          '<span class="reimport-stat add">➕ Nowe: <strong>' + addCount + '</strong></span>' +
          '<span class="reimport-stat skip">⏭ Bez zmian: <strong>' + skipCount + '</strong></span>' +
          (deleteCount ? '<span class="reimport-stat delete">🗑️ Do usunięcia (PLANNED, brak daty): <strong>' + deleteCount + '</strong></span>' : '') +
          (protectCount ? '<span class="reimport-stat protect">🔒 Chronione (mają dane): <strong>' + protectCount + '</strong></span>' : '') +
        '</div>' +
        (deleteCount ? '<div class="reimport-delete-list"><strong>Zostaną usunięte:</strong> ' +
          diff.toDelete.map(ex => escHtml(ex.Title || ('PRJ '+ex.ProjectID))).join(', ') +
        '</div>' : '') +
        (protectCount ? '<div class="reimport-protect-note">⚠️ Poniższe rekordy zniknęły z pliku, ale mają już datę audytu lub inny status — nie zostaną usunięte, sprawdź ręcznie: ' +
          diff.protected_.map(ex => escHtml(ex.Title || ('PRJ '+ex.ProjectID))).join(', ') +
        '</div>' : '') +
      '</div>';

      document.getElementById("import-count").textContent = addCount + ' nowych + usuń ' + deleteCount;
    } else {
      document.getElementById("import-count").textContent = importParsed.length;
    }
  } else {
    document.getElementById("import-count").textContent = importParsed.length;
  }

  document.getElementById("import-info").innerHTML = infoHtml;

  const tbody = document.getElementById("import-preview-tbody");
  tbody.innerHTML = importParsed.slice(0, 20).map(r =>
    '<tr>' +
      '<td title="' + escHtml(r.Title) + '">' + escHtml(r.Title || '—') + '</td>' +
      '<td>' + programBadge(r.Program) + '</td>' +
      '<td>' + (r.AuditType ? shortType(r.AuditType) : '—') + '</td>' +
      '<td>' + (r.PlannedCUDate ? r.PlannedCUDate.substring(0,10) : '—') + '</td>' +
      '<td>' + escHtml(r.City || '—') + '</td>' +
      '<td>' + escHtml(r.AuditorName || '—') + '</td>' +
    '</tr>'
  ).join("");

  if (importParsed.length > 20) {
    tbody.innerHTML += '<tr><td colspan="6" style="text-align:center;color:var(--text2);padding:8px">… i ' + (importParsed.length - 20) + ' więcej</td></tr>';
  }
}

async function startImport() {
  if (!importParsed.length) return;
  hide("import-stage-2");
  show("import-stage-3");
  document.getElementById("btn-do-import").disabled = true;

  try {
    const existingIds = await fetchExistingProjectIds();
    let imported = 0, skipped = 0, deleted = 0, errors = 0;
    let firstError = "";
    const total = importParsed.length;

    // ── Faza 1: usuń osierocone rekordy (re-import tego samego Q+Y) ──
    if (reimportDiff && reimportDiff.toDelete.length > 0) {
      const toDelete = reimportDiff.toDelete;
      for (let i = 0; i < toDelete.length; i++) {
        document.getElementById("import-progress-text").textContent =
          "Usuwanie osieroconych rekordów " + (i+1) + "/" + toDelete.length + " — " + (toDelete[i].Title || "");
        document.getElementById("progress-fill").style.width =
          Math.round(((i+1) / toDelete.length) * 30) + "%"; // 0-30% na usuwanie
        try {
          await deleteAudit(toDelete[i].Id);
          deleted++;
        } catch(err) {
          errors++;
          if (!firstError) firstError = err.message;
          console.error("Delete error for", toDelete[i].Title, err.message);
        }
      }
    }

    // ── Faza 2: dodaj nowe rekordy ──
    for (let i = 0; i < total; i++) {
      const rec = importParsed[i];
      const pct = 30 + Math.round(((i + 1) / total) * 70); // 30-100%
      document.getElementById("progress-fill").style.width = pct + "%";
      document.getElementById("import-progress-text").textContent =
        "Importowanie " + (i+1) + "/" + total + " — " + (rec.Title || "");

      const dupKey = `${rec.ProjectID}_${rec.Year || ""}_${rec.Program || ""}`;
      if (existingIds.has(dupKey)) { skipped++; continue; }

      const spFields = {
        Title:          rec.Title,
        ProjectID:      rec.ProjectID,
        Program:        rec.Program,
        AuditType:      rec.AuditType,
        Standard:       rec.Standard,
        AuditDateStart: null,
        AuditDateEnd:   null,
        PlannedCUDate:  rec.PlannedCUDate,
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
        await addAudit(spFields);
        existingIds.add(dupKey);
        imported++;
      } catch(err) {
        errors++;
        if (!firstError) firstError = err.message;
        console.error("Import error for", rec.Title, err.message);
      }
    }

    allAudits = await fetchAllAudits();
    reimportDiff = null;

    hide("import-stage-3");
    show("import-stage-4");

    const protectedMsg = reimportDiff && reimportDiff.protected_ && reimportDiff.protected_.length
      ? '<div class="result-item warn">🔒 Chronione (mają dane ręczne): <strong>' + reimportDiff.protected_.length + '</strong> — sprawdź ręcznie</div>'
      : "";

    document.getElementById("import-results").innerHTML =
      '<div class="import-result-box">' +
        (imported > 0 ? '<div class="result-item success">✅ Dodano: <strong>' + imported + '</strong></div>' : '') +
        (deleted > 0  ? '<div class="result-item delete">🗑️ Usunięto osierocone: <strong>' + deleted + '</strong></div>' : '') +
        (skipped > 0  ? '<div class="result-item skip">⏭ Bez zmian: <strong>' + skipped + '</strong></div>' : '') +
        protectedMsg +
        (errors > 0   ? '<div class="result-item error">❌ Błędy: <strong>' + errors + '</strong>' + (firstError ? '<br><small>' + escHtml(firstError.substring(0,200)) + '</small>' : '') + '</div>' : '') +
      '</div>';

    renderTable();
    renderAuditorsTable();
    const msg = deleted > 0
      ? "Re-import: +" + imported + " nowych, −" + deleted + " usuniętych"
      : "Import zakończony: +" + imported + " audytów";
    showToast(msg, imported > 0 || deleted > 0 ? "success" : "info");

  } catch(e) {
    showToast("Błąd importu: " + e.message, "error");
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
    updateCustodyWarning(val);
  });

  document.getElementById("new-days").addEventListener("change", e => {
    const days = parseFloat(e.target.value);
    document.getElementById("new-mode").value = (!isNaN(days) && days <= 0.25) ? "Online" : "On-site";
  });

  setupFirmaAutocomplete();
}

// Ostrzeżenie (miękkie) o kolizji z opieką nad Szymonem przy wyborze daty audytu
function updateCustodyWarning(dateVal) {
  const box = document.getElementById("new-date-warning");
  if (!box) return;
  let info = null;
  try { if (dateVal && window.OpiekaModule && window.OpiekaModule.dayInfo) info = window.OpiekaModule.dayInfo(dateVal); } catch {}
  if (info && info.father) {
    box.innerHTML = `👨‍👦 <strong>Tego dnia masz opiekę nad Szymonem</strong> (${info.reason}). Sprawdź dostępność lub zaplanuj online.`;
    box.classList.remove("hidden");
  } else {
    box.innerHTML = "";
    box.classList.add("hidden");
  }
  setDateCustodyIcon("new-date-icon", dateVal, MY_AUDITOR);
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

  // Znajdź ostatni audyt tej firmy (posortuj po dacie malejąco)
  const last = allAudits
    .filter(a => a.Title === name)
    .sort((a, b) => (b.AuditDateStart || "").localeCompare(a.AuditDateStart || ""))
    [0];

  if (!last) return;

  // Pola do autofill — (id elementu, wartość z bazy)
  const fills = [
    ["new-program",  last.Program    || ""],
    ["new-standard", last.Standard   || ""],
    ["new-address",  last.Address    || ""],
    ["new-city",     last.City       || ""],
    ["new-postal",   last.PostalCode || ""],
    ["new-email",    last.ClientEmail|| ""],
    ["new-phone",    last.Phone      || ""],
    ["new-mobile",   last.Mobile     || ""],
  ];

  const filled = [];
  fills.forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (val) {
      el.value = val;
      el.classList.add("autofilled");
      setTimeout(() => el.classList.remove("autofilled"), 2000);
      filled.push(el.labels?.[0]?.textContent || id);
    }
  });

  // Banner informacyjny
  const banner = document.getElementById("autofill-banner");
  if (banner) {
    const dateStr = last.AuditDateStart ? ` (ostatni audyt: ${formatDate(last.AuditDateStart)})` : "";
    banner.innerHTML = `✅ Dane uzupełnione z bazy${dateStr} — możesz edytować każde pole`;
    banner.classList.remove("hidden");
  }
}

function openAddAuditModal() {
  ["new-title","new-standard","new-address","new-city","new-postal",
   "new-email","new-phone","new-mobile","new-notes"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  document.getElementById("new-program").value  = "";
  document.getElementById("new-type").value     = "";
  document.getElementById("new-date").value     = "";
  document.getElementById("new-days").value     = "1";
  document.getElementById("new-mode").value     = "On-site";
  document.getElementById("new-quarter").value  = "";
  document.getElementById("new-year").value     = new Date().getFullYear();
  document.getElementById("new-status").value   = "PLANNED";
  const banner = document.getElementById("autofill-banner");
  if (banner) banner.classList.add("hidden");
  updateCustodyWarning("");
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

  const g = id => (document.getElementById(id)?.value || "").trim();
  const rec = {
    Title:          title,
    Program:        program,
    AuditType:      type,
    Standard:       g("new-standard"),
    AuditDateStart: safeDate(date),
    AuditDays:      days,
    AuditMode:      g("new-mode") || "On-site",
    AuditStatus:    g("new-status") || "PLANNED",
    Proforma:       "Brak",
    Address:        g("new-address"),
    City:           g("new-city"),
    PostalCode:     g("new-postal"),
    ClientEmail:    g("new-email"),
    Phone:          g("new-phone"),
    Mobile:         g("new-mobile"),
    Quarter:        quarter,
    Year:           parseInt(g("new-year")) || new Date().getFullYear(),
    AuditorName:    MY_AUDITOR,
    Notes:          g("new-notes"),
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

function escHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toggleRowPreview(id, clickedRow) {
  const preview = document.getElementById("preview-" + id);
  if (!preview) return;

  const isOpen = preview.style.display !== "none";

  // Zamknij wszystkie inne podglądy
  document.querySelectorAll(".row-preview-wrap").forEach(el => {
    el.style.display = "none";
  });
  document.querySelectorAll(".audit-row.row-expanded").forEach(el => {
    el.classList.remove("row-expanded");
  });

  if (!isOpen) {
    preview.style.display = "table-row";
    const tr = clickedRow || document.querySelector(`.audit-row[data-id="${id}"]`);
    if (tr) tr.classList.add("row-expanded");
  }
}

function programBadge(p) {
  const cls = {
    "FSC CoC": "fsc", "FSC": "fsc",
    "PEFC CoC": "pefc", "PEFC": "pefc",
    "KZR INiG": "kzr",
    "SURE": "sure",
    "EUDR": "eudr",
  };
  const label = p === "FSC" ? "FSC CoC" : p === "PEFC" ? "PEFC CoC" : (p || "—");
  return `<span class="badge badge-${cls[p] || 'fsc'}">${label}</span>`;
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

// ============================================================
// ZMIANY AUDYTORA
// ============================================================
let auditHistory = {};      // { year: { "prj_program": { prj, title, program, auditor } } }
let changesFilesByYear = {}; // { year: [{filename, count}] }
let logoBase64 = null;
let pdfFontRegular = null;  // base64 Poppins-Regular
let pdfFontBold    = null;  // base64 Poppins-SemiBold

const LS_HISTORY_KEY = "auditHistory_v1";
const LS_FILES_KEY   = "changesFilesByYear_v1";

function saveHistoryToStorage() {
  try {
    localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(auditHistory));
    localStorage.setItem(LS_FILES_KEY,   JSON.stringify(changesFilesByYear));
  } catch(e) { console.warn("localStorage save failed:", e); }
}

function loadHistoryFromStorage() {
  try {
    const h = localStorage.getItem(LS_HISTORY_KEY);
    const f = localStorage.getItem(LS_FILES_KEY);
    if (h) auditHistory       = JSON.parse(h);
    if (f) changesFilesByYear = JSON.parse(f);
  } catch(e) { console.warn("localStorage load failed:", e); }
}

function restoreChangesUI() {
  if (!Object.keys(auditHistory).length) return;
  const container = document.getElementById("changes-loaded-files");
  container.innerHTML = "";
  // Odtwórz chipy dla każdego roku
  Object.keys(auditHistory).sort().forEach(year => {
    const files = changesFilesByYear[year] || [];
    const totalRec = Object.keys(auditHistory[year] || {}).length;
    const chip = document.createElement("div");
    chip.className = "loaded-file-chip";
    chip.dataset.year = year;
    chip.title = files.map(f => f.filename).join(", ");
    chip.innerHTML = `📁 <strong>${year}</strong> — ${files.length || "?"} plik${files.length === 1 ? "" : "i"} <span class="chip-count">${totalRec} rek.</span>`;
    container.appendChild(chip);
  });
  document.getElementById("changes-table-wrapper").style.display = "";
  renderChangesTable();
}

function clearHistory() {
  if (!confirm("Wyczyścić wszystkie wgrane dane historyczne?")) return;
  auditHistory = {};
  changesFilesByYear = {};
  localStorage.removeItem(LS_HISTORY_KEY);
  localStorage.removeItem(LS_FILES_KEY);
  document.getElementById("changes-loaded-files").innerHTML = "";
  document.getElementById("changes-table-wrapper").style.display = "none";
  document.getElementById("btn-changes-clear").style.display = "none";
  // Reset year filter options
  const yrSel = document.getElementById("changes-year-filter");
  yrSel.innerHTML = `<option value="">Wszystkie lata</option>`;
  // Reset table body
  document.getElementById("changes-tbody").innerHTML =
    `<tr><td colspan="4" class="loading">Wgraj pliki aby zobaczyć dane</td></tr>`;
  showToast("Dane wyczyszczone", "success");
}

function initLogoBase64() {
  fetch("logo.png").then(r => r.blob()).then(blob => {
    const reader = new FileReader();
    reader.onloadend = () => { logoBase64 = reader.result; };
    reader.readAsDataURL(blob);
  }).catch(() => {});
}

async function loadPdfFonts() {
  async function ttfToBase64(url) {
    const r = await fetch(url);
    const buf = await r.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  try {
    if (!pdfFontRegular) pdfFontRegular = await ttfToBase64("fonts/Poppins-Regular.ttf");
    if (!pdfFontBold)    pdfFontBold    = await ttfToBase64("fonts/Poppins-SemiBold.ttf");
  } catch(e) { console.warn("Nie udało się załadować fontów PDF:", e); }
}

function registerPdfFonts(doc) {
  if (pdfFontRegular) {
    doc.addFileToVFS("Poppins-Regular.ttf", pdfFontRegular);
    doc.addFont("Poppins-Regular.ttf", "Poppins", "normal");
  }
  if (pdfFontBold) {
    doc.addFileToVFS("Poppins-SemiBold.ttf", pdfFontBold);
    doc.addFont("Poppins-SemiBold.ttf", "Poppins", "bold");
  }
}

function setupChanges() {
  initLogoBase64();
  loadPdfFonts();
  loadHistoryFromStorage();
  restoreChangesUI();

  const dropZone = document.getElementById("changes-drop-zone");
  dropZone.addEventListener("dragover", e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    [...e.dataTransfer.files].forEach(handleHistoryFile);
  });
  // btn-changes-pick to teraz <label for="changes-file"> — nie potrzebuje JS click

  document.getElementById("changes-file").addEventListener("change", e => {
    [...e.target.files].forEach(handleHistoryFile);
    e.target.value = "";
  });

  document.getElementById("changes-auditor-filter").addEventListener("change", renderChangesTable);
  document.getElementById("changes-program-filter").addEventListener("change", renderChangesTable);
  document.getElementById("changes-year-filter").addEventListener("change", renderChangesTable);
  document.getElementById("changes-only-filter").addEventListener("change", renderChangesTable);
  document.getElementById("btn-pdf-rzeznik").addEventListener("click", generatePdfRzeznik);
  document.getElementById("btn-changes-clear").addEventListener("click", clearHistory);

  // Pokaż przycisk wyczyść jeśli są dane
  if (Object.keys(auditHistory).length) {
    document.getElementById("btn-changes-clear").style.display = "";
  }
}

function handleHistoryFile(file) {
  if (!file.name.match(/\.xlsx?$/i)) return;

  const yearMatch = file.name.match(/(\d{4})/);
  const year = yearMatch ? parseInt(yearMatch[1]) : null;
  if (!year || year < 2020 || year > 2035) {
    showToast(`Nie można wykryć roku z nazwy: ${file.name}`, "error");
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array", cellText: false, cellNF: false });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Napraw błędny !ref (niektóre pliki CUC mają za mały zakres w metadanych)
      const allAddrs = Object.keys(ws).filter(k => !k.startsWith("!"));
      if (allAddrs.length > 0) {
        const decoded = allAddrs.map(a => XLSX.utils.decode_cell(a));
        const maxR = Math.max(...decoded.map(d => d.r));
        const maxC = Math.max(...decoded.map(d => d.c));
        ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });
      }

      const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");

      // Pomocnik: pobierz wartość komórki jako string
      const getVal = (row, col) => {
        const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
        if (!cell) return "";
        // inlineStr, shared string i formula — wszystkie zwracają v lub w
        const v = cell.w !== undefined ? cell.w : (cell.v !== undefined ? cell.v : "");
        return String(v).trim();
      };

      // Znajdź wiersz nagłówkowy (szukaj "project ref" w kolumnie A)
      let headerRow = -1;
      for (let r = range.s.r; r <= Math.min(range.s.r + 15, range.e.r); r++) {
        if (getVal(r, 0).toLowerCase().includes("project ref")) {
          headerRow = r; break;
        }
      }
      if (headerRow === -1) {
        showToast(`Brak nagłówków w: ${file.name}`, "error"); return;
      }

      // Znajdź indeksy kolumn po nazwie
      let cPrj = -1, cName = -1, cProg = -1, cAud = -1;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const h = getVal(headerRow, c).toLowerCase();
        if (h.includes("project ref"))  cPrj  = c;
        if (h.includes("project name")) cName = c;
        if (h.includes("subprogram"))   cProg = c;
        if (h.includes("inspector"))    cAud  = c;
      }

      if (!auditHistory[year]) auditHistory[year] = {};
      let count = 0;

      for (let r = headerRow + 1; r <= range.e.r; r++) {
        const prjRaw = getVal(r, cPrj);
        if (!prjRaw) continue;
        const prj = parseInt(prjRaw.replace(/\D/g, ""));
        if (!prj) continue;

        const title   = getVal(r, cName);
        const program = normProgram(getVal(r, cProg)) || getVal(r, cProg);
        const auditor = normAuditor(getVal(r, cAud));
        if (!title || !auditor) continue;

        const key = `${prj}_${normProgramKey(program)}`;
        auditHistory[year][key] = { prj, title, program, auditor };
        count++;
      }

      showToast(`✓ ${file.name} — ${count} rekordów (${year})`, "success");
      updateChangesLoadedUI(file.name, year, count);
      saveHistoryToStorage();
      document.getElementById("btn-changes-clear").style.display = "";
      renderChangesTable();
    } catch(err) {
      showToast(`Błąd ${file.name}: ${err.message}`, "error");
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function updateChangesLoadedUI(filename, year, count) {
  // Akumuluj pliki dla danego roku
  if (!changesFilesByYear[year]) changesFilesByYear[year] = [];
  const existingEntry = changesFilesByYear[year].find(f => f.filename === filename);
  if (existingEntry) existingEntry.count = count;
  else changesFilesByYear[year].push({ filename, count });

  const container = document.getElementById("changes-loaded-files");
  const existingChip = container.querySelector(`[data-year="${year}"]`);
  if (existingChip) existingChip.remove();

  // Całkowita liczba unikalnych rekordów dla roku (z auditHistory)
  const totalRec = Object.keys(auditHistory[year] || {}).length;
  const files = changesFilesByYear[year];
  const fileCount = files.length;
  const fileNames = files.map(f => f.filename).join(", ");

  const chip = document.createElement("div");
  chip.className = "loaded-file-chip";
  chip.dataset.year = year;
  chip.title = fileNames;
  chip.innerHTML = `📁 <strong>${year}</strong> — ${fileCount} plik${fileCount === 1 ? "" : "i"} <span class="chip-count">${totalRec} rek.</span>`;
  container.appendChild(chip);
  document.getElementById("changes-table-wrapper").style.display = "";
}

function buildHistoryMap() {
  const map = {};
  Object.entries(auditHistory).forEach(([year, records]) => {
    Object.entries(records).forEach(([key, rec]) => {
      if (!map[key]) map[key] = { prj: rec.prj, title: rec.title, program: rec.program, years: {} };
      map[key].years[year] = rec.auditor;
    });
  });
  return map;
}

function renderChangesTable() {
  const years = Object.keys(auditHistory).map(Number).sort();
  if (!years.length) return;

  // Dynamic headers
  document.getElementById("changes-thead").innerHTML = `<tr>
    <th>PRJ</th><th>Firma</th><th>Program</th>
    ${years.map(y => `<th>${y}</th>`).join("")}
    <th>Zmiana</th>
  </tr>`;

  const map = buildHistoryMap();
  const auditorFilter = document.getElementById("changes-auditor-filter").value;
  const programFilter = document.getElementById("changes-program-filter").value;
  const yearFilter    = document.getElementById("changes-year-filter").value;
  const onlyChanges   = document.getElementById("changes-only-filter").checked;

  // Kolumny lat do wyświetlenia (filtrowane jeśli wybrany rok)
  const visibleYears = yearFilter ? [Number(yearFilter)] : years;

  // Nagłówki — tylko widoczne lata
  document.getElementById("changes-thead").innerHTML = `<tr>
    <th>PRJ</th><th>Firma</th><th>Program</th>
    ${visibleYears.map(y => `<th>${y}</th>`).join("")}
    <th>Zmiana</th>
  </tr>`;

  let rows = Object.values(map).map(r => {
    // hasChange i hasRzeznik zawsze na podstawie WSZYSTKICH lat
    const allVals = years.map(y => r.years[String(y)] || null).filter(Boolean);
    const hasChange  = new Set(allVals).size > 1;
    const hasRzeznik = allVals.includes(MY_AUDITOR);
    return { ...r, hasChange, hasRzeznik };
  });

  if (programFilter) rows = rows.filter(r => normProgramKey(r.program) === normProgramKey(programFilter));
  if (auditorFilter) rows = rows.filter(r => Object.values(r.years).includes(auditorFilter));
  // Filtr roku: pokaż tylko wiersze, które mają audytora w wybranym roku
  if (yearFilter)    rows = rows.filter(r => r.years[yearFilter]);
  if (onlyChanges)   rows = rows.filter(r => r.hasChange);

  rows.sort((a, b) => {
    const aTop = a.hasChange && a.hasRzeznik;
    const bTop = b.hasChange && b.hasRzeznik;
    if (aTop && !bTop) return -1;
    if (!aTop && bTop) return 1;
    if (a.hasChange && !b.hasChange) return -1;
    if (!a.hasChange && b.hasChange) return 1;
    return a.title.localeCompare(b.title, "pl");
  });

  // Aktualizuj dropdown audytorów
  const allNames = [...new Set(Object.values(map).flatMap(r => Object.values(r.years)))].filter(Boolean)
    .sort((a, b) => a === MY_AUDITOR ? -1 : b === MY_AUDITOR ? 1 : a.localeCompare(b, "pl"));
  const sel = document.getElementById("changes-auditor-filter");
  const cur = sel.value;
  sel.innerHTML = `<option value="">Wszyscy audytorzy</option>` +
    allNames.map(n => `<option value="${n}"${n === cur ? " selected" : ""}>${n}</option>`).join("");

  // Aktualizuj dropdown lat
  const yrSel = document.getElementById("changes-year-filter");
  const curYr = yrSel.value;
  yrSel.innerHTML = `<option value="">Wszystkie lata</option>` +
    years.map(y => `<option value="${y}"${String(y) === curYr ? " selected" : ""}>${y}</option>`).join("");

  const tbody = document.getElementById("changes-tbody");
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${3 + visibleYears.length + 1}" class="loading">Brak wyników</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const rowCls = r.hasChange && r.hasRzeznik ? "change-row-rzeznik"
                 : r.hasChange ? "change-row" : "";

    // Komórki tylko dla widocznych lat
    const yearCells = visibleYears.map(y => {
      const aud = r.years[String(y)];
      if (!aud) return `<td class="ch-cell ch-empty">—</td>`;
      const cls = aud === MY_AUDITOR ? "ch-cell ch-rzeznik" : "ch-cell";
      return `<td class="${cls}" title="${aud}">${shortAuditor(aud)}</td>`;
    }).join("");

    const indicator = r.hasChange && r.hasRzeznik ? `<td class="ch-ind ch-ind-rzeznik">⚡ Rzeźnik</td>`
                    : r.hasChange                 ? `<td class="ch-ind ch-ind-change">🔄 Zmiana</td>`
                    :                               `<td class="ch-ind">—</td>`;
    return `<tr class="${rowCls}">
      <td class="prj-col">${r.prj}</td>
      <td class="firm-col" title="${r.title}">${r.title.length > 42 ? r.title.slice(0, 40) + "…" : r.title}</td>
      <td>${programBadge(r.program)}</td>
      ${yearCells}${indicator}
    </tr>`;
  }).join("");
}

function shortAuditor(name) {
  if (!name) return "—";
  const p = name.trim().split(" ");
  return p.length >= 2 ? `${p[0]} ${p[1][0]}.` : name;
}

// ============================================================
// PDF — RZEŹNIK MICHAŁ
// ============================================================
async function generatePdfRzeznik() {
  const years = Object.keys(auditHistory).map(Number).sort();
  if (!years.length) { showToast("Najpierw wgraj pliki Auditsoverview", "error"); return; }

  const programFilter = document.getElementById("changes-program-filter").value.trim();
  const auditorFilter = document.getElementById("changes-auditor-filter").value.trim();
  const yearFilter    = document.getElementById("changes-year-filter").value.trim();

  showToast("Generowanie PDF…", "info");
  await loadPdfFonts();

  try {
    const map = buildHistoryMap();
    const cameToRzeznik = [], leftRzeznik = [], stayedRzeznik = [];
    const programLabel = programFilter || "Wszystkie systemy";

    const allYears = Object.keys(auditHistory).map(Number).sort();
    const activeYears = yearFilter
      ? allYears.filter(y => y <= Number(yearFilter)).slice(-2)
      : allYears;

    let records = Object.values(map);
    if (programFilter) records = records.filter(r => normProgramKey(r.program) === normProgramKey(programFilter));
    if (auditorFilter) records = records.filter(r => Object.values(r.years).includes(auditorFilter));
    if (yearFilter)    records = records.filter(r => r.years[yearFilter]);

    records.forEach(r => {
      const vals = activeYears.map(y => r.years[String(y)] || null);
      const hasRzeznik = vals.includes(MY_AUDITOR);
      if (!hasRzeznik) return;
      const hasOther = vals.some(v => v && v !== MY_AUDITOR);
      if (!hasOther) {
        const lastYear = String(activeYears[activeYears.length - 1]);
        const prevYears = activeYears.slice(0, -1).map(String);
        const isNewClient = prevYears.length > 0 && prevYears.every(y => !r.years[y]);
        if (isNewClient) {
          cameToRzeznik.push({ ...r, from: "nowy klient", year: Number(lastYear) });
        } else {
          stayedRzeznik.push(r);
        }
        return;
      }
      for (let i = 0; i < activeYears.length - 1; i++) {
        const prev = r.years[String(activeYears[i])];
        const next = r.years[String(activeYears[i + 1])];
        if (prev && next && prev !== next) {
          if (next === MY_AUDITOR) cameToRzeznik.push({ ...r, from: prev, year: activeYears[i + 1] });
          if (prev === MY_AUDITOR) leftRzeznik.push({ ...r, to: next,   year: activeYears[i + 1] });
        }
      }
    });

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    registerPdfFonts(doc);
    const F = pdfFontRegular ? "Poppins" : "helvetica";

    // ── LogisticFit Design System tokens ────────────────────────
    const NAVY    = [58,  77, 152];   // --lf-navy   #3a4d98
    const NAVY900 = [28,  38,  80];   // --lf-navy-900 #1c2650
    const NAVY100 = [230, 233, 245];  // --lf-navy-100
    const GREEN   = [35, 157,  70];   // --lf-green  #239d46
    const GREEN100= [224, 243, 230];  // --lf-green-100
    const DANGER  = [200,  54,  45];  // --lf-danger #c8362d
    const DANGER_BG=[251, 229, 227];  // --lf-danger-bg
    const INK     = [14,  20,  48];   // --lf-ink    #0e1430
    const S700    = [58,  66,  99];   // --lf-slate-700
    const S500    = [107,115, 146];   // --lf-slate-500
    const S300    = [194,199, 214];   // --lf-slate-300
    const S200    = [225,228, 238];   // --lf-slate-200
    const S100    = [238,240, 246];   // --lf-slate-100
    const S50     = [247,248, 251];   // --lf-slate-50
    const WHITE   = [255, 255, 255];

    const now   = new Date();
    const dd    = String(now.getDate()).padStart(2,"0");
    const mm_   = String(now.getMonth()+1).padStart(2,"0");
    const yyyy  = now.getFullYear();
    const dateStr = `${dd}.${mm_}.${yyyy}`;

    // ── Szablon strony (header + footer) — rysowany na końcu ────
    function drawPageTemplate(pageNum, totalPages) {
      // Pasek navy górny (32mm)
      doc.setFillColor(...NAVY900);
      doc.rect(0, 0, 210, 32, "F");

      // Zielony akcent (3mm)
      doc.setFillColor(...GREEN);
      doc.rect(0, 32, 210, 3, "F");

      // Nazwa firmy (tekst zamiast logo)
      doc.setTextColor(...WHITE);
      doc.setFontSize(11); doc.setFont(F, "bold");
      doc.text("LOGISTICFIT", 14, 19);

      // Prawa strona headera
      doc.setTextColor(184, 192, 224);  // --fg-on-dark-2
      doc.setFontSize(6.5); doc.setFont(F, "normal");
      doc.text("RAPORT ZMIAN AUDYTORA", 196, 10, { align: "right" });
      doc.setTextColor(...WHITE);
      doc.setFontSize(11); doc.setFont(F, "bold");
      doc.text("Michał Rzeźnik", 196, 18, { align: "right" });
      doc.setFontSize(7.5); doc.setFont(F, "normal");
      doc.setTextColor(...GREEN);
      doc.text(programLabel, 196, 25, { align: "right" });

      // Stopka
      doc.setDrawColor(...S200);
      doc.setLineWidth(0.25);
      doc.line(14, 283, 196, 283);
      doc.setFontSize(6.5); doc.setFont(F, "normal");
      doc.setTextColor(...S500);
      doc.text("LogisticFit  ·  Audit CRM  ·  Dokument poufny  ·  " + dateStr, 14, 288.5);
      doc.text(pageNum + " / " + totalPages, 196, 288.5, { align: "right" });
    }

    // ── Breadcrumb / meta (str. 1, poniżej headera) ─────────────
    // Zaczyna od y=43 (32 header + 3 green + 8 gap)
    let y = 43;

    doc.setFontSize(7); doc.setFont(F, "normal");
    doc.setTextColor(...S500);
    const metaParts = ["Lata: " + activeYears.join(", ")];
    if (programFilter) metaParts.push("System: " + programLabel);
    if (yearFilter)    metaParts.push("Rok: " + yearFilter);
    doc.text(metaParts.join("   ·   "), 14, y);

    y += 10;

    // ── 4 KPI Cards (białe, z bordem — styl dashboard) ───────────
    const total = stayedRzeznik.length + cameToRzeznik.length + leftRzeznik.length;
    const kpis = [
      { overline: "KLIENTÓW ŁĄCZNIE",  val: total,                valColor: NAVY,   bg: WHITE,    border: S200 },
      { overline: "NOWI KLIENCI",       val: cameToRzeznik.length, valColor: GREEN,  bg: GREEN100, border: GREEN },
      { overline: "ODESZLI KLIENCI",    val: leftRzeznik.length,   valColor: DANGER, bg: DANGER_BG,border: DANGER },
      { overline: "STALI KLIENCI",      val: stayedRzeznik.length, valColor: NAVY,   bg: S50,      border: S200 },
    ];
    const cardW = 43, cardH = 28, cardGap = 3;
    kpis.forEach((k, i) => {
      const cx = 14 + i * (cardW + cardGap);
      // Karta
      doc.setFillColor(...k.bg);
      doc.setDrawColor(...k.border);
      doc.setLineWidth(0.4);
      doc.roundedRect(cx, y, cardW, cardH, 2.5, 2.5, "FD");
      // Overline label
      doc.setFontSize(5.5); doc.setFont(F, "bold");
      doc.setTextColor(...S500);
      doc.text(k.overline, cx + cardW / 2, y + 7, { align: "center" });
      // Liczba
      doc.setFontSize(26); doc.setFont(F, "bold");
      doc.setTextColor(...k.valColor);
      doc.text(String(k.val), cx + cardW / 2, y + 21, { align: "center" });
    });
    y += cardH + 14;

    // ── Helper: section header (overline + title) ────────────────
    function sectionHeading(overline, title, yPos) {
      // Overline
      doc.setFontSize(6); doc.setFont(F, "bold");
      doc.setTextColor(...S500);
      doc.text(overline, 14, yPos);
      // Title
      doc.setFontSize(11); doc.setFont(F, "bold");
      doc.setTextColor(...INK);
      doc.text(title, 14, yPos + 6);
      // Divider
      doc.setDrawColor(...S200);
      doc.setLineWidth(0.25);
      doc.line(14, yPos + 9, 196, yPos + 9);
      return yPos + 13;
    }

    // ── Style tabel ──────────────────────────────────────────────
    const tblStyles = {
      font: F, fontSize: 7.5,
      cellPadding: { top: 2.5, right: 3.5, bottom: 2.5, left: 3.5 },
      textColor: S700,
      lineColor: S200, lineWidth: 0.2,
    };
    const tblHead = (accent) => ({
      fillColor: S100, textColor: S500,
      fontStyle: "bold", fontSize: 6.5, font: F,
      halign: "left",
    });
    const tblAlt  = { fillColor: S50 };
    const tblM    = { top: 45, left: 14, right: 14 };
    const cols4   = {
      0: { cellWidth: 16, halign: "right", textColor: S500 },
      1: { cellWidth: 78 },
      2: { cellWidth: 22 },
      3: { cellWidth: 46 },
      4: { cellWidth: 14, halign: "center" },
    };

    // ── Nowi klienci ─────────────────────────────────────────────
    if (cameToRzeznik.length) {
      y = sectionHeading("ZMIANY · NOWI", "Nowi klienci Rzeźnika", y);
      doc.autoTable({
        startY: y,
        head: [["PRJ", "Firma", "Program", "Poprzedni audytor", "Rok"]],
        body: cameToRzeznik.map(r => [
          r.prj,
          r.title.length > 46 ? r.title.slice(0, 44) + "…" : r.title,
          r.program, r.from, r.year,
        ]),
        styles: tblStyles, headStyles: tblHead(GREEN),
        alternateRowStyles: tblAlt, columnStyles: cols4,
        margin: tblM,
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 4) {
            d.cell.styles.textColor = GREEN;
            d.cell.styles.fontStyle = "bold";
          }
        },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // ── Odeszli klienci ──────────────────────────────────────────
    if (leftRzeznik.length) {
      if (y > 224) { doc.addPage(); y = 48; }
      y = sectionHeading("ZMIANY · ODESZLI", "Klienci, którzy odeszli od Rzeźnika", y);
      doc.autoTable({
        startY: y,
        head: [["PRJ", "Firma", "Program", "Nowy audytor", "Rok"]],
        body: leftRzeznik.map(r => [
          r.prj,
          r.title.length > 46 ? r.title.slice(0, 44) + "…" : r.title,
          r.program, r.to, r.year,
        ]),
        styles: tblStyles, headStyles: tblHead(DANGER),
        alternateRowStyles: tblAlt, columnStyles: cols4,
        margin: tblM,
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index === 4) {
            d.cell.styles.textColor = DANGER;
            d.cell.styles.fontStyle = "bold";
          }
        },
      });
      y = doc.lastAutoTable.finalY + 14;
    }

    // ── Stali klienci ────────────────────────────────────────────
    if (stayedRzeznik.length) {
      if (y > 218) { doc.addPage(); y = 48; }
      y = sectionHeading("KLIENCI STALI", "Stali klienci Rzeźnika", y);
      const stayCols = {
        0: { cellWidth: 16, halign: "right", textColor: S500 },
        1: { cellWidth: 84 },
        2: { cellWidth: 24 },
      };
      years.forEach((yr, idx) => {
        stayCols[3 + idx] = { cellWidth: 14, halign: "center" };
      });
      doc.autoTable({
        startY: y,
        head: [["PRJ", "Firma", "Program", ...years.map(String)]],
        body: stayedRzeznik.map(r => [
          r.prj,
          r.title.length > 46 ? r.title.slice(0, 44) + "…" : r.title,
          r.program,
          ...years.map(yr => r.years[String(yr)] ? "✓" : "–"),
        ]),
        styles: tblStyles, headStyles: tblHead(NAVY),
        alternateRowStyles: tblAlt, columnStyles: stayCols,
        margin: tblM,
        didParseCell: (d) => {
          if (d.section === "body" && d.column.index >= 3) {
            const v = d.cell.raw;
            d.cell.styles.textColor = v === "✓" ? GREEN : S300;
            d.cell.styles.fontStyle = v === "✓" ? "bold" : "normal";
          }
        },
      });
    }

    // ── Narysuj szablon na wszystkich stronach ───────────────────
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      drawPageTemplate(i, totalPages);
    }

    doc.save("Raport_Rzeznik_" + yyyy + "-" + mm_ + "-" + dd + ".pdf");
    showToast("PDF wygenerowany — " + programLabel, "success");

  } catch(err) {
    showToast("Błąd generowania PDF: " + err.message, "error");
    console.error("PDF error:", err);
  }
}

// ============================================================
// MODUŁ: OPIEKA NAD SZYMONEM (harmonogram opieki ojca)
// Samowystarczalny — własny localStorage, prefiks op-/Opieka.
// ============================================================
// ============================================================
// MODUŁ: MAPA AUDYTÓW (Leaflet + OpenStreetMap + Nominatim)
// ============================================================
const MapModule = (function () {
  const GEO_CACHE_KEY = "auditGeoCache_v1";
  const STATUS_COLORS = {
    PLANNED:  "#3a4d98",
    DONE:     "#239d46",
    REJECTED: "#dc3545",
    CHANGE:   "#fd7e14",
    Invoice:  "#6f42c1",
  };

  let map = null;
  let markers = [];
  let geoCache = {};
  let geocodeQueue = [];
  let geocoding = false;

  function loadCache() {
    try { geoCache = JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || "{}"); } catch { geoCache = {}; }
  }
  function saveCache() {
    try { localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(geoCache)); } catch {}
  }

  function cityKey(city) { return (city || "").trim().toLowerCase(); }

  function initMap() {
    if (map) return;
    // Fix Leaflet icon paths (bundled locally)
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({ iconUrl: "marker-icon.png", iconRetinaUrl: "marker-icon-2x.png", shadowUrl: "marker-shadow.png" });

    map = L.map("audit-map", { zoomControl: true }).setView([52.0, 19.5], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 18,
    }).addTo(map);
  }

  function clearMarkers() {
    markers.forEach(m => map.removeLayer(m));
    markers = [];
  }

  function statusColor(status) { return STATUS_COLORS[status] || "#8a93ad"; }

  function circleMarker(latlng, color, count) {
    const size = Math.min(10 + count * 4, 32);
    return L.circleMarker(latlng, {
      radius: size,
      fillColor: color,
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.85,
    });
  }

  function buildPopup(city, audits) {
    const lines = audits.slice(0, 20).map(a => {
      const date = a.AuditDateStart ? String(a.AuditDateStart).substring(0, 10) : "—";
      const color = statusColor(a.AuditStatus);
      return `<li style="margin-bottom:5px"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:5px;flex-shrink:0"></span><strong>${a.Title || "—"}</strong><br><span style="color:#666;font-size:11px">${a.Program || ""} · ${a.AuditStatus || ""} · ${date}</span></li>`;
    }).join("");
    const more = audits.length > 20 ? `<li style="color:#666;font-size:11px">…i ${audits.length - 20} więcej</li>` : "";
    return `<div style="min-width:220px;max-width:300px"><strong style="font-size:14px">${city}</strong><br><span style="color:#666;font-size:12px">${audits.length} audyt${audits.length === 1 ? "" : audits.length < 5 ? "y" : "ów"}</span><ul style="margin:8px 0 0;padding-left:0;list-style:none;max-height:200px;overflow-y:auto">${lines}${more}</ul></div>`;
  }

  function renderMarkers(audits) {
    clearMarkers();
    // Grupuj wg miasta
    const byCity = {};
    audits.forEach(a => {
      const city = (a.City || "").trim();
      if (!city) return;
      const k = cityKey(city);
      if (!byCity[k]) byCity[k] = { city, audits: [] };
      byCity[k].audits.push(a);
    });

    Object.values(byCity).forEach(({ city, audits: cityAudits }) => {
      const coords = geoCache[cityKey(city)];
      if (!coords) return;
      // Kolor = najczęstszy status w tym mieście
      const statusCount = {};
      cityAudits.forEach(a => { statusCount[a.AuditStatus] = (statusCount[a.AuditStatus] || 0) + 1; });
      const topStatus = Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0]?.[0];
      const color = statusColor(topStatus);
      const m = circleMarker([coords.lat, coords.lon], color, cityAudits.length);
      m.bindPopup(buildPopup(city, cityAudits), { maxWidth: 320 });
      // Etykieta liczby
      if (cityAudits.length > 1) {
        m.bindTooltip(String(cityAudits.length), { permanent: true, direction: "center", className: "map-count-label" });
      }
      m.addTo(map);
      markers.push(m);
    });
  }

  function renderList(audits) {
    const el = document.getElementById("map-list");
    const cnt = document.getElementById("map-count");
    if (!el) return;
    const list = [...audits].sort((a, b) => (a.City || "").localeCompare(b.City || "", "pl"));
    cnt.textContent = `${list.length} audyt${list.length === 1 ? "" : list.length < 5 ? "y" : "ów"}`;
    el.innerHTML = list.map(a => {
      const color = statusColor(a.AuditStatus);
      const date  = a.AuditDateStart ? String(a.AuditDateStart).substring(0, 10) : "—";
      return `<li class="map-list-item">
        <span class="map-list-dot" style="background:${color}"></span>
        <div class="map-list-body">
          <div class="map-list-title">${a.Title || "—"}</div>
          <div class="map-list-meta">${a.City || "—"} · ${a.Program || "?"} · ${date}</div>
        </div>
        <span class="map-list-status" style="color:${color}">${a.AuditStatus || "?"}</span>
      </li>`;
    }).join("");
  }

  // Nominatim geocoding z kolejką i rate-limiting (1 req/s)
  function scheduleGeocode(cities, onDone) {
    const toFetch = cities.filter(c => !geoCache[cityKey(c)]);
    if (!toFetch.length) { onDone(); return; }
    geocodeQueue = [...toFetch];
    let done = 0;
    const total = toFetch.length;
    const status = document.getElementById("map-geocode-status");

    function next() {
      if (!geocodeQueue.length) { geocoding = false; saveCache(); onDone(); if (status) status.textContent = ""; return; }
      const city = geocodeQueue.shift();
      if (status) status.textContent = `Geokodowanie: ${city} (${++done}/${total})…`;
      fetch(`https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(city)}&country=Poland&format=json&limit=1`, {
        headers: { "Accept-Language": "pl", "User-Agent": "LogisticFit-AuditCRM/1.0" }
      })
      .then(r => r.json())
      .then(data => {
        if (data && data[0]) geoCache[cityKey(city)] = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon), name: data[0].display_name };
        else geoCache[cityKey(city)] = null; // nie znaleziono
        setTimeout(next, 1100); // respektuj limit Nominatim (1 req/s)
      })
      .catch(() => { setTimeout(next, 1100); });
    }
    geocoding = true;
    next();
  }

  const MAP_FILTER_KEYS = ["status", "year", "quarter", "program"];
  const MAP_FILTER_LABELS = { status: "Status", year: "Rok", quarter: "Kwartał", program: "Program" };
  let mapFiltersInited = false;

  function getMapSelectedMulti(key) {
    return [...document.querySelectorAll(`#map-filter-${key}-panel input[type=checkbox]:checked`)].map(cb => cb.value);
  }

  function updateMapBtn(key) {
    const sel = getMapSelectedMulti(key);
    const btn = document.getElementById(`map-filter-${key}-btn`);
    if (!btn) return;
    const label = MAP_FILTER_LABELS[key];
    btn.textContent = sel.length === 0 ? label : sel.length === 1 ? sel[0] : `${label} (${sel.length})`;
    btn.classList.toggle("filter-multi-active", sel.length > 0);
  }

  function getAuditsForMap() {
    const statuses = getMapSelectedMulti("status");
    const years    = getMapSelectedMulti("year");
    const quarters = getMapSelectedMulti("quarter");
    const programs = getMapSelectedMulti("program");
    const all = (typeof allAudits !== "undefined" && Array.isArray(allAudits)) ? allAudits : [];
    return all.filter(a => {
      if (a.AuditorName !== MY_AUDITOR) return false;
      if (statuses.length > 0 && !statuses.includes(a.AuditStatus)) return false;
      if (years.length    > 0 && !years.includes(String(a.Year))) return false;
      if (quarters.length > 0 && !quarters.includes(a.Quarter)) return false;
      if (programs.length > 0 && !programs.some(p => normProgramKey(p) === normProgramKey(a.Program))) return false;
      return true;
    });
  }

  function refresh() {
    if (!map) return;
    const audits = getAuditsForMap();
    renderMarkers(audits);
    renderList(audits);
  }

  function setupMapFilters() {
    if (mapFiltersInited) return;
    mapFiltersInited = true;

    MAP_FILTER_KEYS.forEach(key => {
      const btn   = document.getElementById(`map-filter-${key}-btn`);
      const panel = document.getElementById(`map-filter-${key}-panel`);
      if (!btn || !panel) return;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        MAP_FILTER_KEYS.forEach(k => { if (k !== key) document.getElementById(`map-filter-${k}-panel`)?.classList.add("hidden"); });
        panel.classList.toggle("hidden");
      });
      panel.querySelectorAll("input[type=checkbox]").forEach(cb => {
        cb.addEventListener("change", () => { updateMapBtn(key); refresh(); });
      });
      updateMapBtn(key); // inicjalizuj etykietę (obsługa checked w HTML)
    });

    document.addEventListener("click", e => {
      if (!e.target.closest(".filter-multi-wrap")) {
        MAP_FILTER_KEYS.forEach(key => { document.getElementById(`map-filter-${key}-panel`)?.classList.add("hidden"); });
      }
    }, { capture: false });

    document.getElementById("map-btn-clear")?.addEventListener("click", () => {
      MAP_FILTER_KEYS.forEach(key => {
        document.querySelectorAll(`#map-filter-${key}-panel input[type=checkbox]`).forEach(cb => { cb.checked = false; });
        updateMapBtn(key);
      });
      refresh();
    });
  }

  function render() {
    loadCache();
    initMap();
    setTimeout(() => map.invalidateSize(), 100);
    setupMapFilters();

    const all = (typeof allAudits !== "undefined" && Array.isArray(allAudits)) ? allAudits : [];
    const allMyCities = [...new Set(all.filter(a => a.AuditorName === MY_AUDITOR).map(a => (a.City || "").trim()).filter(Boolean))];

    const audits = getAuditsForMap();
    renderList(audits);
    renderMarkers(audits);

    scheduleGeocode(allMyCities, () => { renderMarkers(getAuditsForMap()); });
  }

  return { render };
})();
window.MapModule = MapModule;

const OpiekaModule = (function () {
  const CHILD = "Szymon";
  const CFG_KEY = "opieka_config_v1";
  const DEFAULT_CFG = { handoverHour: 15, ferieStarts: {} };

  let CFG = loadCfg();
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let currentView = "year";
  let currentWeekStart = (() => {
    const now = new Date();
    const day = (now.getDay() + 6) % 7;
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  })();
  let inited = false;

  function loadCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return { ...DEFAULT_CFG };
      const p = JSON.parse(raw);
      return { ...DEFAULT_CFG, ...p, ferieStarts: { ...(p.ferieStarts || {}) } };
    } catch { return { ...DEFAULT_CFG }; }
  }
  function saveCfg() { localStorage.setItem(CFG_KEY, JSON.stringify(CFG)); }

  /* --- daty --- */
  const $ = id => document.getElementById(id);
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const setTime = (d, h, mi) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi, 0, 0);
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const DNI = ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"];
  const MIES = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września", "października", "listopada", "grudnia"];
  const MIES_NOM = ["Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"];
  const pad = n => String(n).padStart(2, "0");
  function fmtDateTime(d) { return `${DNI[d.getDay()]} ${d.getDate()} ${MIES[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`; }
  function fmtDate(d) { return `${DNI[d.getDay()]} ${d.getDate()} ${MIES[d.getMonth()]} ${d.getFullYear()}`; }

  function isoWeek(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const ft = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const fd = (ft.getUTCDay() + 6) % 7;
    ft.setUTCDate(ft.getUTCDate() - fd + 3);
    return 1 + Math.round((d.getTime() - ft.getTime()) / (7 * 86400000));
  }
  function easterSunday(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }
  function custodyWeekStart(dt, hh) {
    const day = (dt.getDay() + 6) % 7;
    let monday = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - day, hh, 0, 0, 0);
    if (dt < monday) monday = addDays(monday, -7);
    return monday;
  }

  /* --- okresy specjalne (wersja 2) --- */
  function specialPeriodsForYear(Y, cfg) {
    const hh = cfg.handoverHour, list = [];
    const odd = (Y % 2 !== 0), even = (Y % 2 === 0);
    // Boże Narodzenie — lata NIEPARZYSTE: 24.12 10:00 -> 29.12 8:00
    list.push({ label: "Boże Narodzenie", start: new Date(Y, 11, 24, 10, 0), end: new Date(Y, 11, 29, 8, 0), owner: odd ? "father" : "mother" });
    // Sylwester / Nowy Rok — lata PARZYSTE: 29.12 8:00 -> 06.01 (Y+1) 20:00
    list.push({ label: "Sylwester / Nowy Rok", start: new Date(Y, 11, 29, 8, 0), end: new Date(Y + 1, 0, 6, 20, 0), owner: even ? "father" : "mother" });
    // Wielkanoc — lata PARZYSTE
    const easter = easterSunday(Y);
    list.push({ label: "Wielkanoc", start: setTime(addDays(easter, -2), 10, 0), end: setTime(addDays(easter, 1), 20, 0), owner: even ? "father" : "mother" });
    // Wakacje letnie — lata PARZYSTE
    list.push({ label: "Wakacje letnie (lipiec)", start: new Date(Y, 6, 16, 0, 0), end: new Date(Y, 7, 1, 0, 0), owner: even ? "father" : "mother" });
    list.push({ label: "Wakacje letnie (sierpień)", start: new Date(Y, 7, 16, 0, 0), end: new Date(Y, 8, 1, 0, 0), owner: even ? "father" : "mother" });
    // Boże Ciało — lata PARZYSTE (Wielkanoc+60)
    const corpus = addDays(easter, 60);
    list.push({ label: "Boże Ciało", start: setTime(addDays(corpus, -1), hh, 0), end: setTime(addDays(corpus, 4), 8, 0), owner: even ? "father" : "mother" });
    // Długi weekend majowy — lata NIEPARZYSTE
    {
      let first = new Date(Y, 4, 1), last = new Date(Y, 4, 3);
      for (;;) { const p = addDays(first, -1); const wd = p.getDay(); if (wd === 0 || wd === 6) first = p; else break; }
      for (;;) { const n = addDays(last, 1); const wd = n.getDay(); if (wd === 0 || wd === 6) last = n; else break; }
      list.push({ label: "Długi weekend majowy", start: setTime(first, 0, 0), end: setTime(addDays(last, 1), 0, 0), owner: odd ? "father" : "mother" });
    }
    // Ferie zimowe — lata PARZYSTE, 2. tydzień: piątek -> kolejny piątek 10:00
    const fs = cfg.ferieStarts && cfg.ferieStarts[String(Y)];
    if (fs) {
      const start = new Date(fs + "T00:00:00");
      if (!isNaN(start)) {
        const friWk1 = addDays(start, 4);
        list.push({ label: "Ferie zimowe (2. tydzień)", start: setTime(friWk1, hh, 0), end: setTime(addDays(friWk1, 7), 10, 0), owner: even ? "father" : "mother" });
      }
    }
    return list;
  }

  function ownerAt(dt, cfg) {
    const yrs = [dt.getFullYear() - 1, dt.getFullYear(), dt.getFullYear() + 1];
    let sp = [];
    yrs.forEach(y => { sp = sp.concat(specialPeriodsForYear(y, cfg)); });
    for (const p of sp) if (dt >= p.start && dt < p.end) return { owner: p.owner, reason: p.label, special: true };
    const monday = custodyWeekStart(dt, cfg.handoverHour);
    const wk = isoWeek(monday);
    const owner = (wk % 2 !== 0) ? "father" : "mother";
    return { owner, reason: owner === "father" ? `Tydzień nieparzysty (${wk})` : `Tydzień parzysty (${wk})`, special: false };
  }

  function fatherIntervals(rangeStart, rangeEnd, cfg) {
    const bset = new Set();
    for (let y = rangeStart.getFullYear() - 1; y <= rangeEnd.getFullYear() + 1; y++)
      specialPeriodsForYear(y, cfg).forEach(p => { bset.add(+p.start); bset.add(+p.end); });
    let m = custodyWeekStart(rangeStart, cfg.handoverHour);
    while (m <= rangeEnd) { bset.add(+m); m = addDays(m, 7); }
    bset.add(+rangeStart); bset.add(+rangeEnd);
    const bounds = [...bset].filter(t => t >= +rangeStart && t <= +rangeEnd).sort((a, b) => a - b);
    const raw = [];
    for (let i = 0; i < bounds.length - 1; i++) {
      const s = new Date(bounds[i]), e = new Date(bounds[i + 1]);
      if (e <= s) continue;
      const info = ownerAt(new Date((bounds[i] + bounds[i + 1]) / 2), cfg);
      if (info.owner === "father") raw.push({ start: s, end: e, reason: info.reason, special: info.special });
    }
    const merged = [];
    for (const iv of raw) {
      const last = merged[merged.length - 1];
      if (last && +last.end === +iv.start) { last.end = iv.end; if (iv.special && !last.special) { last.reason = iv.reason; last.special = true; } }
      else merged.push({ ...iv });
    }
    return merged;
  }

  /* --- render --- */
  function renderToday() {
    const now = new Date(), info = ownerAt(now, CFG), box = $("op-today");
    const isF = info.owner === "father";
    box.className = "op-today " + (isF ? "is-father" : "is-other");
    const ivs = fatherIntervals(addDays(now, -2), addDays(now, 400), CFG);
    let nextTxt = "—";
    if (isF) { const cur = ivs.find(iv => now >= iv.start && now < iv.end); if (cur) nextTxt = `Koniec opieki ojca: ${fmtDateTime(cur.end)}`; }
    else { const nx = ivs.find(iv => iv.start > now); if (nx) nextTxt = `Następne przejęcie przez ojca: ${fmtDateTime(nx.start)}`; }
    box.innerHTML =
      `<div class="op-today-main"><span class="op-today-who">${isF ? `Dziś ${CHILD} jest u OJCA` : `Dziś ${CHILD} nie jest u ojca`}</span>` +
      `<span class="op-today-reason">${info.reason}${info.special ? " · okres specjalny" : ""}</span></div>` +
      `<div class="op-today-next">${nextTxt}</div>`;
  }

  // mapa "YYYY-MM-DD" -> [audyty Rzeźnik Michał tego dnia] (z globalnego allAudits)
  function auditsByDayMap() {
    const map = {};
    try {
      const list = (typeof allAudits !== "undefined" && Array.isArray(allAudits)) ? allAudits : [];
      list.forEach(a => {
        if (a.AuditorName !== MY_AUDITOR || !a.AuditDateStart) return;
        const key = String(a.AuditDateStart).substring(0, 10);
        (map[key] = map[key] || []).push(a);
      });
    } catch {}
    return map;
  }

  function updateLabel() {
    const lbl = $("op-year-label");
    if (currentView === "year") {
      lbl.textContent = currentYear;
    } else if (currentView === "month") {
      lbl.textContent = `${MIES_NOM[currentMonth]} ${currentYear}`;
    } else {
      const end = addDays(currentWeekStart, 6);
      const wk = isoWeek(currentWeekStart);
      const fmtS = d => `${d.getDate()} ${MIES[d.getMonth()].substring(0, 3)}`;
      lbl.textContent = `Tydz. ${wk} · ${fmtS(currentWeekStart)}–${fmtS(end)} ${end.getFullYear()}`;
    }
  }

  function renderCalendar() {
    updateLabel();
    if (currentView === "year") renderYearView();
    else if (currentView === "month") renderMonthView();
    else renderWeekView();
  }

  function renderYearView() {
    const wrap = $("op-calendar"); wrap.className = "op-calendar op-calendar-year"; wrap.innerHTML = "";
    const today = new Date();
    const auditsMap = auditsByDayMap();
    for (let mo = 0; mo < 12; mo++) {
      const card = document.createElement("div"); card.className = "op-month";
      const h = document.createElement("h4"); h.textContent = MIES_NOM[mo]; card.appendChild(h);
      const grid = document.createElement("div"); grid.className = "op-month-grid";
      ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].forEach(d => { const c = document.createElement("div"); c.className = "op-dow"; c.textContent = d; grid.appendChild(c); });
      const first = new Date(currentYear, mo, 1), lead = (first.getDay() + 6) % 7;
      for (let i = 0; i < lead; i++) grid.appendChild(document.createElement("div"));
      const dim = new Date(currentYear, mo + 1, 0).getDate();
      for (let d = 1; d <= dim; d++) {
        const cell = document.createElement("div"); cell.className = "op-day";
        const dd = new Date(currentYear, mo, d);
        const iN = ownerAt(setTime(dd, 21, 0), CFG), iM = ownerAt(setTime(dd, 10, 0), CFG);
        const fN = iN.owner === "father", fM = iM.owner === "father";
        if (fN) cell.classList.add("father");
        if (fN !== fM) cell.classList.add("handover");
        if (sameDay(dd, today)) cell.classList.add("is-today");
        if (iN.special && fN) cell.classList.add("special");
        cell.textContent = d;
        let tt = `${fmtDate(dd)}\n${iN.reason}` + (fN ? "\n→ opieka ojca" : "\n→ poza opieką ojca");
        const key = `${currentYear}-${pad(mo + 1)}-${pad(d)}`;
        const dayAudits = auditsMap[key];
        if (dayAudits && dayAudits.length) {
          cell.classList.add("has-audit");
          if (fN) cell.classList.add("conflict");
          const dot = document.createElement("span"); dot.className = "op-audit-dot"; cell.appendChild(dot);
          tt += `\n\n📋 Audyt(y) tego dnia:\n` + dayAudits.map(a => `• ${a.Title || "—"} (${a.Program || "?"})`).join("\n");
          if (fN) tt += `\n⚠ Kolizja z opieką nad Szymonem`;
        }
        cell.title = tt;
        grid.appendChild(cell);
      }
      card.appendChild(grid); wrap.appendChild(card);
    }
  }

  function renderMonthView() {
    const wrap = $("op-calendar"); wrap.className = "op-calendar op-calendar-month"; wrap.innerHTML = "";
    const today = new Date();
    const auditsMap = auditsByDayMap();
    const cont = document.createElement("div"); cont.className = "op-month-large";

    // Header row with day names
    const hdrRow = document.createElement("div"); hdrRow.className = "op-month-large-header";
    ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].forEach(d => {
      const h = document.createElement("div"); h.className = "op-dow-large"; h.textContent = d; hdrRow.appendChild(h);
    });
    cont.appendChild(hdrRow);

    const grid = document.createElement("div"); grid.className = "op-month-large-grid";
    const first = new Date(currentYear, currentMonth, 1);
    const lead = (first.getDay() + 6) % 7;
    const dim = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let i = 0; i < lead; i++) {
      const emp = document.createElement("div"); emp.className = "op-day-large op-day-empty"; grid.appendChild(emp);
    }
    for (let d = 1; d <= dim; d++) {
      const cell = document.createElement("div"); cell.className = "op-day-large";
      const dd = new Date(currentYear, currentMonth, d);
      const iN = ownerAt(setTime(dd, 21, 0), CFG), iM = ownerAt(setTime(dd, 10, 0), CFG);
      const fN = iN.owner === "father", fM = iM.owner === "father";
      if (fN) cell.classList.add("father");
      if (fN !== fM) cell.classList.add("handover");
      if (sameDay(dd, today)) cell.classList.add("is-today");
      if (iN.special && fN) cell.classList.add("special");

      const num = document.createElement("div"); num.className = "op-day-large-num"; num.textContent = d; cell.appendChild(num);
      if (fN) {
        const st = document.createElement("div"); st.className = "op-day-large-status";
        st.textContent = iN.special ? "★ Specjalny" : "Ojciec"; cell.appendChild(st);
      }
      if (fN !== fM) {
        const ho = document.createElement("div"); ho.className = "op-day-large-ho";
        ho.textContent = fM ? "← powrót" : "→ przejęcie"; cell.appendChild(ho);
      }
      const key = `${currentYear}-${pad(currentMonth + 1)}-${pad(d)}`;
      const dayAudits = auditsMap[key];
      if (dayAudits && dayAudits.length) {
        cell.classList.add("has-audit"); if (fN) cell.classList.add("conflict");
        dayAudits.slice(0, 2).forEach(a => {
          const au = document.createElement("div"); au.className = "op-day-large-audit";
          au.textContent = `📋 ${a.Title || "Audyt"}`; cell.appendChild(au);
        });
      }
      let tt = `${fmtDate(dd)}\n${iN.reason}` + (fN ? "\n→ opieka ojca" : "\n→ poza opieką ojca");
      if (dayAudits && dayAudits.length) { tt += `\n\n📋 Audyt(y):\n` + dayAudits.map(a => `• ${a.Title || "—"} (${a.Program || "?"})`).join("\n"); if (fN) tt += `\n⚠ Kolizja`; }
      cell.title = tt;
      grid.appendChild(cell);
    }
    cont.appendChild(grid); wrap.appendChild(cont);
  }

  function renderWeekView() {
    const wrap = $("op-calendar"); wrap.className = "op-calendar op-calendar-week"; wrap.innerHTML = "";
    const today = new Date();
    const auditsMap = auditsByDayMap();
    const DOW_FULL = ["Poniedziałek", "Wtorek", "Środa", "Czwartek", "Piątek", "Sobota", "Niedziela"];
    const grid = document.createElement("div"); grid.className = "op-week-grid";

    for (let i = 0; i < 7; i++) {
      const dd = addDays(currentWeekStart, i);
      const col = document.createElement("div"); col.className = "op-week-col";
      const iN = ownerAt(setTime(dd, 21, 0), CFG), iM = ownerAt(setTime(dd, 10, 0), CFG);
      const fN = iN.owner === "father", fM = iM.owner === "father";
      if (fN) col.classList.add("father");
      if (fN !== fM) col.classList.add("handover");
      if (sameDay(dd, today)) col.classList.add("is-today");
      if (iN.special && fN) col.classList.add("special");

      const hdr = document.createElement("div"); hdr.className = "op-week-col-hdr";
      hdr.innerHTML = `<span class="op-week-dow">${DOW_FULL[i]}</span><span class="op-week-date">${dd.getDate()} ${MIES[dd.getMonth()]}</span>`;
      col.appendChild(hdr);

      const body = document.createElement("div"); body.className = "op-week-col-body";
      const cust = document.createElement("div"); cust.className = "op-week-custody" + (fN ? " father" : "");
      cust.innerHTML = fN
        ? `<strong>${iN.special ? "★ Specjalny" : "🏠 Ojciec"}</strong><small>${iN.reason}</small>`
        : `<small>${iN.reason}</small>`;
      body.appendChild(cust);

      if (fN !== fM) {
        const hoEl = document.createElement("div"); hoEl.className = "op-week-ho";
        hoEl.textContent = fM ? `← powrót ~${CFG.handoverHour}:00` : `→ przejęcie ~${CFG.handoverHour}:00`;
        body.appendChild(hoEl);
      }

      const key = `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}`;
      const dayAudits = auditsMap[key];
      if (dayAudits && dayAudits.length) {
        col.classList.add("has-audit"); if (fN) col.classList.add("conflict");
        dayAudits.forEach(a => {
          const au = document.createElement("div"); au.className = "op-week-audit" + (fN ? " conflict" : "");
          au.textContent = `📋 ${a.Title || "Audyt"} (${a.Program || "?"})`; body.appendChild(au);
        });
      }
      col.appendChild(body); grid.appendChild(col);
    }
    wrap.appendChild(grid);
  }

  function renderHandovers() {
    const now = new Date(), ivs = fatherIntervals(addDays(now, -1), addDays(now, 200), CFG), ev = [];
    ivs.forEach(iv => { if (iv.start >= now) ev.push({ t: iv.start, type: "start", reason: iv.reason }); if (iv.end >= now) ev.push({ t: iv.end, type: "end", reason: iv.reason }); });
    ev.sort((a, b) => a.t - b.t);
    const list = $("op-handovers"); list.innerHTML = "";
    if (!ev.length) { list.innerHTML = '<li class="op-muted">Brak nadchodzących zdarzeń.</li>'; return; }
    ev.slice(0, 12).forEach(e => {
      const li = document.createElement("li"); li.className = "op-ho " + e.type;
      li.innerHTML = `<span class="op-ho-icon">${e.type === "start" ? "→" : "←"}</span>` +
        `<span class="op-ho-text"><strong>${e.type === "start" ? "Przejęcie przez ojca" : "Powrót do matki"}</strong>` +
        `<span class="op-ho-reason">${e.reason}</span></span><span class="op-ho-date">${fmtDateTime(e.t)}</span>`;
      list.appendChild(li);
    });
  }

  function renderSettings() {
    $("op-set-hour").value = CFG.handoverHour;
    const box = $("op-ferie-list"); box.innerHTML = "";
    [currentYear - 1, currentYear, currentYear + 1, currentYear + 2].forEach(y => {
      const row = document.createElement("div"); row.className = "op-ferie-row";
      const lbl = document.createElement("label"); lbl.textContent = `Ferie ${y} — poniedziałek startu:`;
      const inp = document.createElement("input"); inp.type = "date"; inp.value = CFG.ferieStarts[String(y)] || "";
      inp.addEventListener("change", () => {
        if (inp.value) CFG.ferieStarts[String(y)] = inp.value; else delete CFG.ferieStarts[String(y)];
        saveCfg(); refreshAll();
      });
      row.appendChild(lbl); row.appendChild(inp); box.appendChild(row);
    });
  }

  function icsStamp(d) { return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; }
  function exportICS() {
    const ivs = fatherIntervals(new Date(currentYear, 0, 1, 0, 0), new Date(currentYear + 1, 0, 7, 0, 0), CFG);
    const now = new Date();
    const out = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LogisticFit//Opieka Szymon//PL", "CALSCALE:GREGORIAN"];
    ivs.forEach((iv, idx) => {
      out.push("BEGIN:VEVENT", `UID:opieka-${currentYear}-${idx}@logisticfit`, `DTSTAMP:${icsStamp(now)}`,
        `DTSTART:${icsStamp(iv.start)}`, `DTEND:${icsStamp(iv.end)}`,
        `SUMMARY:Opieka ojca — ${CHILD}`, `DESCRIPTION:${iv.reason}`, "END:VEVENT");
    });
    out.push("END:VCALENDAR");
    const blob = new Blob([out.join("\r\n")], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = `Opieka_${CHILD}_${currentYear}.ics`; a.click(); URL.revokeObjectURL(a.href);
  }

  function refreshAll() { renderToday(); renderCalendar(); renderHandovers(); }

  /* --- API dla planowania audytów: czy dany dzień to dzień opieki ojca --- */
  /* Tryb "cały dzień zajęty": dzień liczy się jako opieka, jeśli ojciec ma Szymona
     w jakimkolwiek momencie tej doby. */
  function dayInfo(dateInput) {
    const d = (dateInput instanceof Date) ? dateInput : new Date(dateInput);
    if (isNaN(d)) return { father: false, reason: "" };
    const day0 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
    const ivs = fatherIntervals(day0, addDays(day0, 1), CFG);
    if (!ivs.length) return { father: false, reason: "" };
    return { father: true, reason: ivs[0].reason, special: !!ivs[0].special };
  }

  function setup() {
    // View switcher
    ["year", "month", "week"].forEach(v => {
      $(`op-view-${v}`).addEventListener("click", () => {
        // Sync state when switching views
        if (v === "month" && currentView === "week") {
          currentYear = currentWeekStart.getFullYear();
          currentMonth = currentWeekStart.getMonth();
        } else if (v === "week" && currentView === "month") {
          const first = new Date(currentYear, currentMonth, 1);
          const day = (first.getDay() + 6) % 7;
          currentWeekStart = new Date(first.getFullYear(), first.getMonth(), first.getDate() - day);
        } else if (v === "week" && currentView === "year") {
          const now = new Date();
          const day = (now.getDay() + 6) % 7;
          currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
          currentYear = currentWeekStart.getFullYear();
        }
        currentView = v;
        document.querySelectorAll(".op-view-btn").forEach(b => b.classList.remove("active"));
        $(`op-view-${v}`).classList.add("active");
        refreshAll();
      });
    });

    // Prev / Next navigation — context-aware
    $("op-prev-year").addEventListener("click", () => {
      if (currentView === "year") { currentYear--; renderSettings(); }
      else if (currentView === "month") {
        currentMonth--; if (currentMonth < 0) { currentMonth = 11; currentYear--; renderSettings(); }
      } else {
        currentWeekStart = addDays(currentWeekStart, -7);
        currentYear = currentWeekStart.getFullYear();
      }
      refreshAll();
    });
    $("op-next-year").addEventListener("click", () => {
      if (currentView === "year") { currentYear++; renderSettings(); }
      else if (currentView === "month") {
        currentMonth++; if (currentMonth > 11) { currentMonth = 0; currentYear++; renderSettings(); }
      } else {
        currentWeekStart = addDays(currentWeekStart, 7);
        currentYear = currentWeekStart.getFullYear();
      }
      refreshAll();
    });

    $("op-btn-ics").addEventListener("click", exportICS);
    $("op-btn-settings").addEventListener("click", () => $("op-settings").classList.toggle("hidden"));
    $("op-set-hour").addEventListener("change", e => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v >= 0 && v <= 23) { CFG.handoverHour = v; saveCfg(); refreshAll(); }
    });
  }

  function render() {
    if (!inited) { setup(); renderSettings(); inited = true; }
    refreshAll();
  }

  return { render, dayInfo };
})();
window.OpiekaModule = OpiekaModule;
