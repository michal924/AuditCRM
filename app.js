// ============================================================
// Audit CRM — Main Application
// ============================================================

let allAudits = [];
let currentAudit = null;
let currentStatus = null;
let currentProforma = null;

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

  // Zalogowany
  document.getElementById("nav-user").textContent = account.name || account.username;
  document.getElementById("btn-logout").onclick = logout;

  show("page-app");
  hide("page-login");

  setupNav();
  setupFilters();
  setupModal();

  await loadAudits();
  await loadAuditorFilter();
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
      if (view === "auditors") renderAuditorsTable();
    };
  });
}

// ============================================================
// ŁADOWANIE DANYCH
// ============================================================
async function loadAudits() {
  document.getElementById("audits-tbody").innerHTML =
    '<tr><td colspan="9" class="loading">Ładowanie danych...</td></tr>';
  try {
    allAudits = await fetchAllAudits();
    renderTable();
  } catch (e) {
    document.getElementById("audits-tbody").innerHTML =
      `<tr><td colspan="9" class="loading">Błąd: ${e.message}</td></tr>`;
  }
}

async function loadAuditorFilter() {
  try {
    const auditors = await fetchAuditors();
    const sel = document.getElementById("filter-auditor");
    sel.innerHTML = '<option value="">Audytor</option>';
    auditors.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.Title;
      opt.textContent = a.Title;
      if (a.Title === "Rzeźnik Michał") opt.selected = false;
      sel.appendChild(opt);
    });
  } catch {}
}

// ============================================================
// FILTRY
// ============================================================
function setupFilters() {
  ["search","filter-quarter","filter-year","filter-program",
   "filter-status","filter-auditor"].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener("input", renderTable);
    el.addEventListener("change", renderTable);
  });

  document.getElementById("btn-clear-filters").onclick = () => {
    document.getElementById("search").value = "";
    ["filter-quarter","filter-year","filter-program",
     "filter-status","filter-auditor"].forEach(id => {
      document.getElementById(id).value = "";
    });
    renderTable();
  };

  document.getElementById("auditors-quarter").addEventListener("change", renderAuditorsTable);
  document.getElementById("auditors-year").addEventListener("change", renderAuditorsTable);
}

function getFilters() {
  return {
    search:   document.getElementById("search").value.toLowerCase(),
    quarter:  document.getElementById("filter-quarter").value,
    year:     document.getElementById("filter-year").value,
    program:  document.getElementById("filter-program").value,
    status:   document.getElementById("filter-status").value,
    auditor:  document.getElementById("filter-auditor").value,
  };
}

function applyFilters(audits) {
  const f = getFilters();
  return audits.filter(a => {
    if (f.search && !((a.Title || "").toLowerCase().includes(f.search))) return false;
    if (f.quarter && a.Quarter !== f.quarter) return false;
    if (f.year    && String(a.Year) !== f.year) return false;
    if (f.program && a.Program !== f.program) return false;
    if (f.status  && a.AuditStatus !== f.status) return false;
    if (f.auditor && a.AuditorName !== f.auditor) return false;
    return true;
  });
}

// ============================================================
// RENDER TABELI AUDYTÓW
// ============================================================
function renderTable() {
  const filtered = applyFilters(allAudits);
  updateStats(filtered);

  const tbody = document.getElementById("audits-tbody");
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Brak wyników</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr onclick="openModal(${a.Id})">
      <td title="${a.Title || ""}">${a.Title || "—"}</td>
      <td>${programBadge(a.Program)}</td>
      <td>${a.AuditType ? shortType(a.AuditType) : "—"}</td>
      <td>${formatDate(a.AuditDateStart)}</td>
      <td>${a.City || "—"}</td>
      <td class="${a.AuditMode === 'Online' ? 'mode-online' : 'mode-onsite'}">${a.AuditMode === 'Online' ? '💻' : '📍'} ${a.AuditMode || "—"}</td>
      <td>${statusBadge(a.AuditStatus)}</td>
      <td>${proformaBadge(a.Proforma)}</td>
      <td>${a.AuditorName ? a.AuditorName.split(" ").reverse()[0] : "—"}</td>
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
// RENDER TABELI AUDYTORÓW
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
    if (!map[name]) map[name] = { total: 0 };
    programs.forEach(p => { if (!map[name][p]) map[name][p] = 0; });
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
    <tr class="${name === 'Rzeźnik Michał' ? 'my-row' : ''}">
      <td>${name}${name === 'Rzeźnik Michał' ? ' ★' : ''}</td>
      ${programs.map(p => `<td>${counts[p] || "—"}</td>`).join("")}
      <td><strong>${counts.total}</strong></td>
    </tr>
  `).join("");
}

// ============================================================
// MODAL
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

  // Zaznacz aktywny status
  document.querySelectorAll(".status-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === a.AuditStatus);
  });
  document.querySelectorAll(".proforma-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.val === a.Proforma);
  });

  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
  currentAudit = null;
}

async function saveChanges() {
  if (!currentAudit) return;
  const btn = document.getElementById("btn-save");
  btn.textContent = "Zapisywanie...";
  btn.disabled = true;
  try {
    await updateAudit(currentAudit.Id, {
      AuditStatus: currentStatus,
      Proforma: currentProforma,
    });
    // Zaktualizuj lokalnie
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
    "Re-assessment": "Re-assess.",
    "Re-Certification Audit": "Re-Cert.",
    "Certification Audit": "Certif.",
    "Extension Audit": "Extension",
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
  const key = (p || "Brak").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return `<span class="badge badge-proforma-${map[p] || 'brak'}">${p || "Brak"}</span>`;
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

function showToast(msg, type = "success") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `toast ${type}`;
  setTimeout(() => t.classList.add("hidden"), 3000);
}

// ============================================================
// START
// ============================================================
init();
