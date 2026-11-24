# Stan LFA Hub (inwentaryzacja, listopad 2026)

Dokument tylko opisuje stan obecny. Nic w aplikacji nie zostało zmienione. Statusy: **działa**, **częściowo**, **brak**.

## Funkcje

| Funkcja | Status | Gdzie w kodzie | Uwagi |
|---|---|---|---|
| Architektura: aplikacja w przeglądarce, SharePoint Lists, logowanie M365 | działa | `index.html`, `app.js`, `api.js`, `auth.js` | Brak backendu i Azure Functions. Klucze do usług AI nie mogą trafić do przeglądarki, więc agent wymaga backendu |
| Dane audytów | działa | lista `Audits`, `fetchAuditsWithSelect` w `api.js` | Klient zapisany w każdym wierszu audytu. Brak osobnej kartoteki klienta |
| Graph: kalendarz Outlook (zaproszenia, zajętość dnia) | działa | `createAuditCalendarEvents`, odczyt zajętości w `app.js`; zakres `Calendars.ReadWrite` w `auth.js` | Tylko kalendarz zalogowanej skrzynki. Drugiej skrzynki (LogisticFit) aplikacja nie czyta |
| Graph: poczta | brak | brak zakresu `Mail.Read` | Ostrzeżenia o dokumentacji SGS wymagają nowego zakresu i zgody administratora |
| Azure poza hostingiem | brak | | Tylko Static Web Apps. Brak Functions, Key Vault, Azure Maps |
| Kalendarz audytów | działa | widok kalendarza, filtr dnia `auditCoversDay`, `applyFilters` | Filtr dnia pokazuje to samo co kalendarz boczny |
| Przypomnienia 90, 60, 30 dni | częściowo | Pulpit (ostrzeżenia w oknie 60 dni), `CertModule` (ważność certyfikatu minus 20 dni) | Brak progów 90 i 30, brak powiadomień poza aplikacją, brak rocznic audytów nadzoru FSC i PEFC |
| Spotkania | częściowo | typy wpisów Spotkanie i Szkolenie w liście `Audits` | Brak notatek ze spotkania, zadań i powiązania z kartoteką klienta |
| Teczka audytu | brak | | Foldery prowadzone ręcznie w OneDrive, układ `PRJ_NAZWA/rok`. Aplikacja ich nie tworzy ani nie linkuje |
| Pola anonimizacji | brak | | Brak pola z pseudonimem klienta i reguł anonimizacji. Potrzebne przed wysłaniem treści do modelu |
| Tygodnie opieki | działa | `OpiekaModule` w `app.js` | Reguła tygodni nieparzystych plus ferie i święta. Konfiguracja w `localStorage`, czyli tylko na jednym urządzeniu |
| Import planu kwartalnego CU | działa | import CUC: `cucYearOf`, `cucMatchKey`, `isStaleCycle`, `CucRepair` | Dopasowanie z rokiem, dodaje tylko brakujące audyty. Zasila też ważność certyfikatów |
| Czytnik planu audytu PDF | działa | `plan.js` (`PlanReader`), `setupPlanReader`, `applyPlanRead` | Szablony CU FSC, PEFC, FSC+PEFC, KZR, SURE oraz SGS KZR. Testy w `tests/` |
| Godziny i miejsce audytu | działa | pola `StartTime`, `EndTime`, `SiteAddress`, `SiteCity`, `SitePostal`; `siteText`, `routeUrl` | Nowe pola, starsze audyty mają je puste |
| Adresy lokalizacji klientów | częściowo | pola `Site*` w audycie, geokodowanie Nominatim z pamięcią `auditGeoCache_v1` | Adres przypisany do audytu, nie do klienta. Wiele lokalizacji klienta nie jest modelowane |
| Mapa | działa | Leaflet i OpenStreetMap w `app.js` | Brak odległości i czasów dojazdu |
| Podróże i hotele | częściowo | koszty km, hotel, autostrada; PDF delegacji | Brak propozycji hoteli, importu kosztów i powiązania z rozliczeniem kosztów firmowych |
| Rozliczenia | działa | `SettleModule`, `SETTLE_FIELDS`, `settleStatusLabel` | Okres miesięczny i półmiesięczny, filtr tylko wykonane, Excel i PDF |
| Plan finansowy | działa | `FinanceModule` | Stawki dzienne w `localStorage` |
| Ważność certyfikatów | działa | lista `Certificates`, `CertModule`, kolumna przy dacie audytu | Bufor 20 dni |
| Flaga bezstronności (klient doradczy LogisticFit) | brak | | Konieczna przed agentem planowania jako twarda blokada |
| Rozdzielenie CU i SGS | częściowo | pole `CertBody`, `certBodyOf()`, `settleStatusLabel()` | Jedna lista i jedna witryna. Rozdział logiczny, nie fizyczny |
| Moduł raportów AI | brak | | Poza zakresem tego etapu |
| Agent planowania | brak | | Plan w `docs/plan-agent-planowania.md` |
| Testy | częściowo | `scripts/test.sh`, `tests/` | Składnia, czytnik planów, style. Brak testów logiki `app.js` |
| Środowisko testowe | częściowo | `IS_TEST` w `api.js`, listy `*_TEST` | Podgląd PR i localhost działają. Gałąź `staging` jest 27 commitów za `main` |

## Ryzyka i dług techniczny

1. `app.js` ma około 6000 linii i zmienne globalne. Każda zmiana dotyka jednego pliku, łatwo o regresję. Brak modułów i testów logiki.
2. Wdrożenie idzie z `main` prosto na produkcję, bez testów w GitHub Actions. Zdarzył się już błąd składni na produkcji na kilka minut.
3. Część ustawień leży w `localStorage` (stawki, opieka, pamięć geokodowania). Inne urządzenie, na przykład iPhone, ich nie widzi.
4. W komentarzach kodu zdarzają się nazwy klientów. Do usunięcia przy porządkach.
5. `SETTLE_FIELDS` służy też za worek na nowe pola spoza rozliczeń. Nazwa myli.
6. Brak dziennika zmian terminów (kto, kiedy, dlaczego). Jest tylko historia wersji SharePoint.
7. Jeden audytor wpisany w kod (`MY_AUDITOR`). Drugi użytkownik wymaga zmian.
8. Brak kartoteki klientów utrudnia anonimizację, flagę bezstronności i wiele lokalizacji.
9. Nominatim ma limity użycia i nie liczy tras. Do planowania potrzebna jest usługa map z macierzą odległości.
10. Brak backendu blokuje bezpieczne użycie modelu AI, czytanie drugiej skrzynki i poczty.
