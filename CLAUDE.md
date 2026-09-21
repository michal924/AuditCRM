# AuditCRM — aplikacja LF Assurance

Webowy CRM audytów (vanilla JS + SharePoint REST + MSAL), Azure Static Web Apps, deploy z `main` przez GitHub Actions.
Marka: **LF Assurance** (granat i bordo, Archivo). To NIE jest marka LogisticFit — nie używaj jej kolorów, logo ani tokenów.

## Design system (obowiązkowo)

Źródło prawdy: `design/README.md`, `design/tokens/tokens.css`, `design/tokens/app.css`, `design/COMPONENTS.md`, `design/assets/logo/`.
Przed budową lub zmianą ekranu przeczytaj `design/README.md` i sekcje `COMPONENTS.md` komponentów, których użyjesz.

Zasady:
1. Kolory, fonty, odstępy, promienie i cienie bierz **tylko z tokenów `--lfa-*`**. Nie wpisuj HEX, `rgb()` ani wartości px poza tokenami — ani w CSS, ani w JS, ani inline w HTML. Jedyne miejsca z HEX: `design/tokens/*.css` i `design/assets/`.
2. Ekrany składaj z komponentów `.lfa-*` opisanych w `design/COMPONENTS.md`. Nie twórz jednorazowych przycisków, kart, badge'y ani pól formularza na ekranie.
3. **Brakuje komponentu lub wariantu? Zatrzymaj się** i zaproponuj go jako zmianę w `design/COMPONENTS.md` + `style.css` (osobny commit). Nie improwizuj na ekranie.
4. Font: Archivo (UI, nagłówki 600), IBM Plex Mono (dane liczbowe, PRJ, daty, kwoty). Pliki lokalne w `fonts/lfa/`.
5. Granat = kolor głównych akcji, **jeden `.lfa-btn.primary` na ekran**. Bordo = akcent i akcje oficjalne. Mosiądz = detal i jednostka SGS. Sukces = granat + tekst/ikona ✓ (nie ma zieleni).
6. Każdy ekran działa w trybie jasnym i ciemnym (`[data-theme]` / `prefers-color-scheme`) oraz od 360 px szerokości, bez poziomego przewijania strony (tabele scrollują w swoim kontenerze).
7. Dostępność: kontrast WCAG AA, widoczny focus (`--lfa-focus-ring`), etykiety pól zawsze widoczne, **status komunikowany tekstem, nie samym kolorem**, cel dotyku ≥ 44 px.
8. Nie używaj tokenów ani zasobów marki LogisticFit. Jednostka CU (Control Union) i SGS to odrębne jednostki certyfikujące — nie zakładaj „tylko CU"; nazwy bierz z `certBodyOf()`.
9. Teksty interfejsu po polsku, krótkie, bez myślników w zdaniach. Przyciski to czasowniki.

## Dane i SharePoint

- Lista `Audits` (`api.js`): nowe pole SharePoint MUSI trafić do `$select` w `fetchAuditsWithSelect` — inaczej zapis działa, a odczyt milcząco gubi pole.
- Pola rozliczeń: stała `SETTLE_FIELDS` (jedno źródło dla `$select`, zapisu, eksportu). Kolumny tworzy `ensureSettleFields()`.
- Statusy i etykiety zależne od jednostki: `settleStatusLabel()` („Wysłany do CU" / „Wysłany do SGS").
- Zgłoszenia rozwoju od użytkownika: lista `DevRequests` — przeczytaj na starcie sesji dev.

## Po każdej zmianie UI

- Uruchom `./scripts/lint-styles.sh` i popraw wszystkie znaleziska (HEX/rgb poza tokenami, fonty poza tokenami).
- Sprawdź ekran w trybie jasnym i ciemnym oraz przy 360 px.
- Wypisz użyte komponenty `.lfa-*` i czy dodałeś nowe tokeny lub warianty (i gdzie).
- `node --check app.js api.js` przed commitem. Deploy: push do `main` → Azure SWA; potwierdź live przez `curl` zasobu.
