#!/usr/bin/env node
// LFA Hub — etap 1: INWENTARZ i plan migracji folderu klienta (tryb próbny, NIC nie kopiuje ani nie zmienia).
// Użycie:
//   node inwentarz.mjs <folder-klienta> [--unit CU|SGS] [--out plan.csv]
//   node inwentarz.mjs --list lista.txt [--unit SGS] [--out plan.csv]     (jedna ścieżka względna na linię; bez haszowania)
// Wynik: CSV „plik → sekcja → typ → akcja → proponowana nazwa → metadane → powód”, do ręcznej akceptacji w arkuszu.
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const listFile = opt("--list"), unit = (opt("--unit", "") || "").toUpperCase(), out = opt("--out", "plan_migracji.csv");
const root = listFile ? null : args.find(a => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--unit" && args[args.indexOf(a) - 1] !== "--out");
if (!listFile && !root) { console.error("Podaj folder klienta albo --list lista.txt"); process.exit(1); }

const SECTIONS = { "01": "01_Przygotowanie", "02": "02_Dokumenty_klienta", "03": "03_Dostawcy", "04": "04_GHG", "05": "05_Zdjecia", "06": "06_Raport_roboczy", "07": "07_Podpisane", "08": "08_Paczka", "09": "09_Korespondencja" };
const IMG = /\.(jpe?g|png|heic|tiff?)$/i, MAIL = /\.(eml|msg)$/i;
const norm = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

// 1. kolekcja plików
let files = [];
if (listFile) files = fs.readFileSync(listFile, "utf8").split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(rel => ({ rel, size: null, hash: null }));
else (function walk(d) { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.name.startsWith(".")) continue;
  if (e.isDirectory()) walk(p); else { const st = fs.statSync(p); files.push({ rel: path.relative(root, p), size: st.size, mtime: st.mtime, hash: null }); } } })(root);

// 2. hasze (tylko tryb folderu) — duplikaty bajt w bajt
if (!listFile) for (const f of files) f.hash = crypto.createHash("sha1").update(fs.readFileSync(path.join(root, f.rel))).digest("hex");
const byHash = new Map(); files.forEach(f => { if (f.hash) { if (!byHash.has(f.hash)) byHash.set(f.hash, []); byHash.get(f.hash).push(f); } });

// 3. klasyfikacja
function sectionOf(rel) {
  const parts = rel.split(/[\\/]/), name = parts[parts.length - 1], n = norm(name), full = norm(rel);
  const m = parts.map(p => p.match(/^(0[1-9])_/)).find(Boolean); if (m) return { sec: m[1], why: "folder " + m[0] };
  if (MAIL.test(name)) return { sec: "09", why: "wiadomość e-mail" };
  if (IMG.test(name)) return { sec: "05", why: "zdjęcie" };
  if (/certyfikat|certificate/.test(n)) return { sec: "07", why: "certyfikat (wynik audytu)" };
  if (/podpisan|signed|lista[_ ]obecnosci/.test(n)) return { sec: "07", why: "w nazwie: podpisany/lista obecności" };
  if (/raport|report|cucrpt|analiza[_ ]ryzyka|lista[_ ]kontrolna|checklist/.test(n)) return { sec: "06", why: "raport / lista kontrolna / analiza ryzyka" };
  if (/dostaw|supplier|deklaracja|rejestr[_ ]kwalif/.test(n)) return { sec: "03", why: "dostawcy / deklaracje" };
  if (/plan[_ ]aud|audplan|zlecenie|kalkulator|notification/.test(n)) return { sec: "01", why: "plan / zlecenie / kalkulator" };
  return { sec: "02", why: "domyślnie: dokument klienta" };
}
const PREV = /(_archiwum|poprzednia[_ ]wersja|przed[_ ]korekta|stara|old)/i;
function meta(rel) {
  const name = rel.split(/[\\/]/).pop(), m = {};
  let x = name.match(/^FL_(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})_/); if (x) m.wgranoDoCU = `${x[1]}-${x[2]}-${x[3]} ${x[4]}:${x[5]}`;
  x = name.match(/PQPC-23-([0-9a-z]+)-KZR/i); if (x) m.formularzSGS = "PQPC-23-" + x[1];
  x = name.match(/_(\d{2})(\d{2})(\d{4})(?=[._ ])/); if (x) m.dataWNazwie = `${x[3]}-${x[2]}-${x[1]}`;
  x = name.match(/wyd\.?\s?(\d+)/i); if (x) m.wydanie = x[1];
  x = name.match(/_(\d{6})_[A-Z]+_/); if (x) m.projekt = x[1];
  return m;
}
// Audyt = pierwszy poziom folderów w stylu „2025_poprzedni_cykl” / „2026_audyt_20260926”; pliki luzem → audyt „(do przypisania)”.
const auditOf = rel => { const p = rel.split(/[\\/]/); return p.length > 1 && /^(19|20)\d{2}/.test(p[0]) ? p[0] : (p.length > 1 && !/^0[1-9]_/.test(p[0]) ? p[0] : "(do przypisania)"); };
const rows = [];
for (const f of files) {
  const rel = f.rel, name = rel.split(/[\\/]/).pop();
  const s = sectionOf(rel), mt = meta(rel); let action = "kopiuj", why = s.why, target = SECTIONS[s.sec];
  const dups = f.hash ? byHash.get(f.hash) : null;
  if (/\.zip$/i.test(name)) { action = "przegląd"; why = "archiwum zip — zwykle kopia plików obok; paczki dla jednostki buduje system"; }
  if (PREV.test(rel)) { action = "wersja-poprzednia"; why = "starsza wersja → wgrać jako v1 pliku o tej samej bazie nazwy"; }
  if (dups && dups.length > 1 && dups[0] !== f) { action = "pomiń-duplikat"; why = "identyczny bajt w bajt z: " + dups[0].rel; }
  if (/^(pefc|fsc)[\\/]/i.test(rel) && dups && dups.length > 1) why += " · folder programu; audyt łączony = jedna kopia";
  if (!/^0[1-9]_/.test(rel.split(/[\\/]/).slice(-2)[0] || "") && rel.split(/[\\/]/).length <= 2 && s.sec === "06" && /lista[_ ]kontrolna/i.test(name)) why += " · luzem w katalogu głównym";
  const proposed = unit === "CU" ? name.replace(/^FL_\d{14}_/, "") : name;       // CU: system dokleja FL_… przy eksporcie — nasza nazwa bez prefiksu
  rows.push({ audyt: auditOf(rel), zrodlo: rel, sekcja: target, akcja: action, nazwa_docelowa: proposed, metadane: JSON.stringify(mt), powod: why, rozmiar: f.size ?? "" });
}
const q = v => `"${String(v).replace(/"/g, '""')}"`;
const header = ["audyt", "zrodlo", "sekcja", "akcja", "nazwa_docelowa", "metadane", "powod", "rozmiar"];
fs.writeFileSync(out, "﻿" + header.join(";") + "\n" + rows.map(r => header.map(h => q(r[h])).join(";")).join("\n") + "\n");
const cnt = {}; rows.forEach(r => { cnt[r.akcja] = (cnt[r.akcja] || 0) + 1; });
const secs = {}; rows.forEach(r => { secs[r.sekcja] = (secs[r.sekcja] || 0) + 1; });
const au = {}; rows.forEach(r => { au[r.audyt] = (au[r.audyt] || 0) + 1; });
console.log("Audyty (foldery główne):", au);
console.log(`Plików: ${rows.length}\nAkcje:`, cnt, "\nSekcje:", secs, `\nZapisano: ${out}`);
