# LFA Hub (dawniej LFA Audit CRM)

Aplikacja webowa LF Assurance do prowadzenia audytów certyfikacyjnych: kalendarz audytów, import planów kwartalnych CU, czytnik planów audytu w PDF, rozliczenia, plan finansowy, ważność certyfikatów, zaproszenia w Outlooku, koszty podróży i delegacje.

Marka: LF Assurance. Zasady pracy i design system opisuje [CLAUDE.md](CLAUDE.md). Plan agenta planowania: [docs/plan-agent-planowania.md](docs/plan-agent-planowania.md). Stan funkcji: [docs/stan-lfa-hub.md](docs/stan-lfa-hub.md).

## Architektura w skrócie

* Statyczna aplikacja w przeglądarce, bez kroku budowania: `index.html`, `app.js`, `api.js`, `auth.js`, `plan.js`, `style.css`.
* Logowanie Microsoft 365 przez MSAL (`auth.js`, dzierżawa logisticfit). Token SharePoint oraz Graph `Calendars.ReadWrite`.
* Dane w SharePoint Lists na witrynie `sites/AuditCRM`: `Audits`, `DevRequests`, `Certificates`. Każda lista ma kopię `*_TEST`.
* Hosting: Azure Static Web Apps. Brak backendu i Azure Functions.
* Biblioteki lokalne (bez CDN): MSAL, Leaflet, jsPDF z autotable, SheetJS, pdf.js 3.11.174.
* `sw.js` to service worker z pamięcią podręczną powłoki aplikacji.

| Plik | Zawartość |
|---|---|
| `app.js` | Cały interfejs i logika modułów (audyty, kalendarz, import CUC, rozliczenia, finanse, certyfikaty, mapa, opieka, delegacje) |
| `api.js` | SharePoint REST: odczyt i zapis list, zakładanie kolumn, środowisko testowe |
| `auth.js` | MSAL, tokeny SharePoint i Graph |
| `plan.js` | `PlanReader`: odczyt daty, godzin i miejsca z planów audytu CU i SGS w PDF |
| `design/` | Design system LF Assurance (tokeny, komponenty, logo) |
| `scripts/` | `test.sh` (testy), `lint-styles.sh` (kontrola tokenów) |
| `tests/` | Testy na danych syntetycznych |
| `docs/` | Dokumentacja projektu, plan agenta, założenia |

## Uruchomienie lokalne

Wymagania: macOS lub dowolny system z Pythonem 3, przeglądarka, konto w dzierżawie M365 z dostępem do witryny AuditCRM.

```bash
python3 -m http.server 8080 --bind 127.0.0.1
```

Otwórz `http://127.0.0.1:8080`. Adres lokalny automatycznie używa list `*_TEST`, więc praca lokalna nie dotyka danych produkcyjnych. Adres `http://127.0.0.1:8080/` jest dopisany w rejestracji aplikacji w Entra ID. Inny port lub `localhost` da błąd AADSTS50011, dopóki nie dopiszesz go tam.

Po zmianie plików odśwież z pominięciem pamięci podręcznej (service worker potrafi trzymać starą wersję). W razie wątpliwości wyrejestruj go w narzędziach przeglądarki.

## Środowiska

| Środowisko | Adres | Listy |
|---|---|---|
| Produkcja | auditcrm.logisticfit.com | `Audits`, `DevRequests`, `Certificates` |
| Staging | `…-staging.centralus.7.azurestaticapps.net` (gałęzie `hub-*`) | `*_TEST` |
| Podgląd PR | `…-<nr PR>.<region>.azurestaticapps.net` (logowanie wymaga dopisania adresu w Entra) | `*_TEST` |
| Lokalnie | 127.0.0.1 lub localhost | `*_TEST` |

Rozpoznanie środowiska: `IS_TEST` w `api.js`. Listy testowe można odtworzyć jako kopię schematu produkcji (funkcje w sekcji „ŚRODOWISKO TESTOWE” w `api.js`). Czyszczenie działa tylko na listach `*_TEST`.

Stały adres testowy: `https://green-flower-047f17c10-staging.centralus.7.azurestaticapps.net/`. Wdraża się na niego każdy push do gałęzi `hub-*` (etapy LFA Hub). Produkcja wdraża się tylko z `main`.

Uwaga: stara gałąź `staging` ma 12 niescalonych commitów z października (między innymi zakładka Klienci, biblioteka dokumentów, import z Laury). Workflow jej nie wdraża. Przed scaleniem trzeba ją przejrzeć.

## Testy

```bash
./scripts/test.sh
```

Skrypt nie wymaga Node. Używa JavaScriptCore z macOS (`osascript -l JavaScript`) i sprawdza:

1. składnię własnych plików JS,
2. czy `app.js` nie jest obcięty,
3. czytnik planów audytu na syntetycznych tekstach (`tests/plan-reader.test.js`),
4. style: tylko tokeny `--lfa-*` (`scripts/lint-styles.sh`).

Testy nie mogą zawierać prawdziwych danych klientów. Nowy przypadek z prawdziwego planu przepisz na dane zmyślone o tym samym układzie linii.

## Wdrożenie

1. `./scripts/test.sh` musi dać `WYNIK: OK`.
2. Zmiana ryzykowna: pull request do `main` i sprawdzenie na adresie podglądu.
3. Push do `main` uruchamia GitHub Actions i wdraża na Azure SWA w około 1 do 2 minut.
4. Potwierdź wersję na produkcji przez `curl` zmienionego pliku (szukaj nowego fragmentu kodu).

## Konwencje

* Nowe pole SharePoint musi trafić do `$select` w `fetchAuditsWithSelect` (`api.js`). Pola rozliczeń i nowsze: `SETTLE_FIELDS`, `SETTLE_NEWER_FIELDS`, kolumny zakłada `ensureSettleFields()`.
* CU i SGS to osobne jednostki. Nazwy zawsze z `certBodyOf()`, statusy z `settleStatusLabel()`.
* Import planu kwartalnego CU tylko dodaje brakujące audyty. Nie nadpisuje zaplanowanych ani wykonanych.
* Teksty interfejsu po polsku, krótkie. Kolory, fonty i odstępy tylko z tokenów `--lfa-*`.
* W kodzie, testach, commitach i dokumentacji nie umieszczaj nazw klientów ani adresów e-mail.
