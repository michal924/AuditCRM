# Komponenty AuditCRM (LF Assurance)

AuditCRM to vanilla JS, więc „komponent" = **klasa CSS `.lfa-*` w `design/components.css` + wzór HTML opisany tutaj**. `style.css` zostaje tylko na układ ekranów (siatki, pozycje) i też używa wyłącznie tokenów. Ekrany składają te klasy; nie tworzą własnych przycisków, kart ani pól. Brakuje wariantu → najpierw dopisz go tu i w `style.css`, dopiero potem użyj.

Wszystkie kolory, fonty, odstępy, promienie: tylko tokeny `--lfa-*`. Każdy komponent działa w trybie jasnym i ciemnym oraz od 360 px.

## Migracja z klas LogisticFit → LF Assurance

| Dziś (LogisticFit) | Docelowo | Uwagi |
| --- | --- | --- |
| `.btn-primary` | `.lfa-btn.primary` | jeden na ekran |
| `.btn-action`, `.btn-action-green` | `.lfa-btn.secondary` | zieleń znika |
| `.btn-ghost` | `.lfa-btn.ghost` | |
| `.btn-plan-audit`, `.btn-settle-audit`, `.btn-rp-edit` | `.lfa-btn.secondary` / `.lfa-btn.accent` | akcje oficjalne = bordo |
| `.badge.badge-{fsc,pefc,kzr,sure,eudr}` | `.lfa-badge[data-program]` | |
| `.badge-{planned,done,...}` | `.lfa-badge[data-status]` | |
| `.badge-body-cuc/sgs`, `.settle-badge`, `.plan-sent` | `.lfa-badge[data-body]`, `[data-settle]`, `[data-plan]` | |
| `.stat-card` | `.lfa-metric` | |
| `.filter-multi-*` | `.lfa-chip`, `.lfa-menu` | |
| `.modal-overlay`, `.modal` | `.lfa-modal-overlay`, `.lfa-modal` | |
| `.field-input`, `.form-input`, `.field-textarea` | `.lfa-input`, `.lfa-select`, `.lfa-textarea` | etykieta zawsze widoczna |
| `.audit-row.row-body-*.row-st-*` | `.lfa-row[data-body][data-status]` | barwa = jednostka, jasność = status |
| `.op-day-large`, `.scal-day`, `.op-day` | `.lfa-cal-cell[data-state]` | |
| `.toast` | `.lfa-toast[data-kind]` | |

## Button — `.lfa-btn`

Kiedy: akcje w formularzach i na ekranach. Nie używać do nawigacji (użyj linku lub `.nav-btn`).

Warianty: `primary` (granat, **jeden na ekran**) · `secondary` (obrys granat) · `ghost` (bez tła) · `accent` (bordo — akcje oficjalne: „Rozlicz audyt", „Wyślij zaproszenie") · `danger` (bordo pełne — usuwanie).
Rozmiary: `md` (36 px, domyślny) · `sm` (30 px).
Stany: default, hover, focus (`--lfa-focus-ring`), active, `:disabled`, `.is-loading`.
Zasady: etykieta = czasownik; ikona (emoji lub SVG) przed tekstem; cel dotyku ≥ 44 px na mobile przez padding.

```html
<button class="lfa-btn primary">💾 Zapisz zmiany</button>
<button class="lfa-btn secondary sm">Edytuj</button>
<button class="lfa-btn accent">💰 Rozlicz audyt</button>
```

## Badge — `.lfa-badge`

Kiedy: status, program, jednostka, rozliczenie, plan. **Zawsze tekst obok koloru.**

Atrybuty: `data-status="planned|done|rejected|change|invoice"`, `data-program="fsc|pefc|kzr|sure|eudr"`, `data-body="cu|sgs"`, `data-settle="open|sent|done"`, `data-plan="sent"`, `data-proforma="none|sent|paid"`.
Kolory z tokenów `--lfa-st-*`, `--lfa-prog-*`, `--lfa-body-*`, `--lfa-settle-*`. Sukces (done/rozliczony/wysłany plan) dostaje prefiks „✓ ".

## Metric — `.lfa-metric`

Karta liczby: etykieta 11px uppercase mono + wartość 24px 600 Archivo. Wariant `emphasis` (obrys granat). Siatka 2–5 w rzędzie.

## Card — `.lfa-card`

Tło `--lfa-surface`, obrys `--lfa-border`, promień `--lfa-radius-lg`, cień `--lfa-shadow`. Wariant `with-header` (pasek z tytułem 600 i akcjami).

## Table — `.lfa-table`

Nagłówek: `--lfa-surface-3`, tekst 11px uppercase Archivo 600 tracking .05em, sortowalny (`th[data-sort]`, ikona ↑↓). Wiersze `.lfa-row[data-body][data-status]`: tło = `color-mix(kolor jednostki <alpha statusu>, surface)` — alpha z `--lfa-row-a-*`. Hover: `filter: brightness(.96)` (barwa zostaje). Liczby, PRJ, daty, kwoty: `.lfa-data` (IBM Plex Mono, tabular). Min-width tabeli + scroll poziomy w kontenerze; kolumna nazwy ≥ 200 px, zawija po słowach.

## Chip filtra — `.lfa-chip` + `.lfa-menu`

Chip: obrys granat, 30 px, tekst 12.5px 500; `.is-active` = tło `--lfa-info-bg`. Menu: lista checkboxów w karcie `--lfa-surface`, cień `--lfa-shadow`.

## Input / Select / Textarea — `.lfa-input`, `.lfa-select`, `.lfa-textarea`

Wysokość 36 px, obrys `--lfa-border-strong`, focus ring, `.is-error` = obrys bordo + komunikat 12px pod polem. Etykieta `.lfa-label` (12px 600 uppercase tracking) **zawsze widoczna**, placeholder tylko jako przykład.

## Modal — `.lfa-modal-overlay`, `.lfa-modal`

Overlay `--lfa-overlay`. Modal: `--lfa-surface`, promień 12px, cień `--lfa-shadow-lg`, max-width 960px, nagłówek z tytułem 600 i `✕`. Sekcje `.lfa-section` z `h3` 11px uppercase mosiądz + linia `--lfa-border`. Zamykanie: ✕, klik w overlay, Esc.

## Alert — `.lfa-alert[data-kind]`

`info` (granat), `success` (granat + ✓), `warning` (mosiądz), `danger` (bordo). Pasek 3px po lewej w kolorze roli, tło z `--lfa-*-bg`.

## Toast — `.lfa-toast[data-kind]`

Jak alert, pływający dół-środek, 3.5 s.

## Calendar cell — `.lfa-cal-cell[data-state]`

Stany: `free` (jasny granat + etykieta „wolny"), `off` (weekend/święto, szary), `busy` (Outlook, bordo), `audit` (chip jednostki), `custody` (krawędź 3px mosiądz + 👨‍👦), `conflict` (obrys bordo), `today` (obrys granat 2px), `selected`. Rozmiary: `lg` (miesiąc), `sm` (rok, boczny).

## Nav — `.navbar`, `.nav-btn`

Pasek `--lfa-surface`, dół `1px --lfa-border`. Logo: lockup poziomy `02` (≥180 px) lub znak `01` + wordmark „AuditCRM" Archivo 600 tracking .05em. Aktywna zakładka: tło `--lfa-primary`, tekst `--lfa-on-primary`.

## EmptyState — `.lfa-empty`

Ikona/emoji 28px, nagłówek 600, jedna linia opisu, **jedna akcja** `.lfa-btn.secondary`.

## Eyebrow — `.lfa-eyebrow`

IBM Plex Mono 11px uppercase tracking .18em, kolor mosiądz. Do sekcji raportów i nagłówków dokumentów.

## Dokumenty PDF (jsPDF)

Fonty z `fonts/lfa/*.ttf` (Archivo 400/600, IBM Plex Mono 400). Pasek tytułu granat, linia pod nagłówkiem tabel bordo 2px, sygnatury i daty mosiądz, suma/razem tło `--lfa-info-bg`. Logo: `02_logo_poziome.svg` → PNG 600px w nagłówku. Stopka: dane firmy + „Wygenerowano z AuditCRM · LF Assurance" + numeracja stron.
