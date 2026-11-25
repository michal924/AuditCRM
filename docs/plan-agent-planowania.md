# Plan agenta planowania LFA Hub

Status: projekt do zatwierdzenia. Nic z tego nie jest jeszcze zbudowane. Założenia w [zalozenia.md](zalozenia.md), stan wyjściowy w [stan-lfa-hub.md](stan-lfa-hub.md).

## 1. Cel i zasada działania

Agent proponuje terminy audytów i spotkań, liczy dojazdy, wykrywa konflikty, blokuje czas na raporty, a później przygotowuje maile i noclegi. **Agent nigdy nie zapisuje niczego sam.** Każdy jego wynik to szkic na liście `PlanDrafts`. Zapis do audytów, kalendarza lub poczty robi wyłącznie aplikacja po kliknięciu „Zatwierdź” przez właściciela.

Bez zgody właściciela agent nigdy: nie zmienia danych produkcyjnych, nie usuwa, nie wysyła maili, nie wpisuje terminów do prawdziwych kalendarzy, nie rezerwuje, nie uruchamia nowych płatnych usług.

## 2. Architektura

* **Przeglądarka (obecna aplikacja):** ekran „Planowanie”, podgląd wariantów, przycisk „Zatwierdź”.
* **Backend:** Azure Functions (plan zużycia) w regionie UE (Poland Central, zapasowo West Europe), na tej samej subskrypcji co Static Web Apps (zintegrowane API SWA).
* **Sekrety:** Azure Key Vault (klucz modelu, klucz map). Nic w przeglądarce.
* **Dostęp do M365:** token użytkownika przekazywany do Functions i wymieniany przez on-behalf-of. Agent widzi tylko to, co widzi zalogowany właściciel.
* **Model:** Claude przez API, wywoływany tylko z backendu. Przed wysłaniem treść jest anonimizowana (punkt 7).
* **Reguły:** lista SharePoint `PlanningRules`, edytowana w aplikacji. Kod czyta reguły, nie ma ich na sztywno.

## 3. Model danych (nowe listy SharePoint, każda z kopią `_TEST`)

| Lista | Najważniejsze pola | Po co |
|---|---|---|
| `Clients` | Pseudonim (np. KL-0042), Nazwa, NIP, CertBody (CU / SGS / oba), DoradczyLF (tak/nie), Uwagi | Jedna kartoteka klienta, anonimizacja, blokada bezstronności |
| `ClientSites` | ClientId, Adres, Kod, Miasto, Lat, Lon, Typ (siedziba, zakład, magazyn) | Wiele lokalizacji klienta |
| `PlanningRules` | Klucz, Wartość, Typ (liczba, godzina, tekst, tak/nie), Opis, Jednostka (CU / SGS / wszystkie), Aktywna | Reguły edytowalne przez właściciela |
| `PlanDrafts` | Typ (wariant planu, wpis kalendarza, mail, nocleg), CertBody, AuditId, Treść JSON, Uzasadnienie, Status (szkic, zatwierdzony, odrzucony), Utworzono, Zatwierdził | Każda propozycja agenta, z historią |
| `ChangeLog` | Obiekt, Pole, Było, Jest, Kto, Kiedy, Powód, ŹródłoSzkicu | Dziennik zmian terminów |
| `TravelCache` | Z (lat, lon zaokrąglone), Do, Km, Minuty, Źródło, Data | Pamięć odległości, mniej zapytań do map |

Audyty dostają pola `ClientId` i `SiteId` (wypełniane stopniowo, stare rekordy działają bez nich). CU i SGS zostają rozdzielone polem `CertBody` we wszystkich listach, a szkice i historia nigdy nie łączą jednostek w jednym rekordzie.

## 4. Reguły planowania (startowe wartości w `PlanningRules`)

| Klucz | Wartość startowa |
|---|---|
| `bazy` | Warszawa, Trzemeszno |
| `dojazd_max_min` | 150 |
| `dojazd_max_km` | 300 |
| `start_min` | 08:30 |
| `bufor_przed_min` | 15 |
| `nocleg_od_km` | 300 |
| `opieka_bez_noclegu` | tak (w tygodniu opieki powrót tego samego dnia) |
| `opieka_preferuj_przeniesienie` | tak (najpierw inny tydzień i łańcuch dzień po dniu, w terminach jednostki) |
| `raport_dni_CU` | 14 |
| `raport_dni_SGS` | 7 |
| `plan_wysylka_dni_KZR_SURE` | 7 |
| `plan_wysylka_dni_FSC_PEFC` | 14 (minimum 7) |
| `SGS_dokumentacja_dni` | 7 |
| `sobota` | tylko wyjątek, wyraźnie oznaczony |
| `audyty_dziennie_max` | 2 (tylko klienci blisko siebie) |
| `limit_tygodniowy` | brak, obciążenie z czasu audytu z kalkulatora |
| `kalendarz_LF_zajety` | tak |
| `bezstronnosc_blokada` | tak (klient doradczy LogisticFit nie może mieć audytu łączonego z wdrożeniem) |

Reguły twarde (blokada bezstronności, rozdział CU i SGS, termin jednostki) nie mogą zostać złamane przez wariant. Reguły miękkie (sobota, dwa audyty dziennie, nocleg) dają ostrzeżenie z uzasadnieniem.

## 5. Narzędzia agenta

**Odczyt (osobne narzędzia, każde z jednym zadaniem):**

* `pobierz_audyty(okres, jednostka)`
* `pobierz_kalendarz(okres, skrzynka)` dla skrzynki LF Assurance i LogisticFit
* `pobierz_opieke(okres)`
* `pobierz_reguly()`
* `odleglosc(z, do)` przez `TravelCache`, a gdy brak, usługa map
* `terminy_jednostki(audyt)` (raport, wysyłka planu, dokumentacja SGS)
* `pobierz_klienta(pseudonim)` bez danych osobowych
* `poczta_sgs(okres)` (etap 4): tylko nagłówki i załączniki, po anonimizacji

**Zapis (wyłącznie szkice w `PlanDrafts`):**

* `zapisz_wariant_planu(...)`
* `zapisz_szkic_kalendarza(...)`
* `zapisz_szkic_maila(...)`
* `zapisz_propozycje_noclegu(...)`

Zatwierdzenie szkicu to osobna funkcja backendu wywoływana kliknięciem w aplikacji. Model nie ma do niej dostępu.

## 6. Etapy

| Etap | Zakres | Pliki | Czas | Koszt API miesięcznie |
|---|---|---|---|---|
| 1. Wspólny kalendarz i odległości | Backend Functions, odczyt obu kalendarzy, listy `Clients`, `ClientSites`, `TravelCache`, `PlanningRules`, czasy dojazdu z baz, widok tygodnia ze wszystkimi zajętościami. Tylko podgląd | `api/` (Functions), `planning.js`, `api.js`, `index.html`, `style.css`, `tests/` | 5 do 7 dni | mapy w darmowym progu, model 0 zł (bez modelu) |
| 2. Warianty planu, konflikty, bloki na raporty | Agent z narzędziami odczytu, 2 do 3 warianty z uzasadnieniem, wykrywanie konfliktów, blokady czasu raportu, flaga bezstronności, `PlanDrafts`, `ChangeLog` | `api/agent/`, `planning.js`, `tests/` | 8 do 10 dni | około 70 do 110 zł |
| 3. Głos z iPhone (priorytet) | „Hej Siri, LFA Hub” bez dotykania telefonu, działa w CarPlay. Dyktowanie iPhone po polsku, odpowiedź czytana na głos. Nazwy klientów i miast dopasowane do bazy. Pytania dostają odpowiedź od razu, zmiany idą jako szkic do zatwierdzenia jednym dotknięciem. LFA Hub jako ikona na ekranie głównym z mikrofonem i listą szkiców. Bez aplikacji w App Store | `api/voice/`, Skróty iOS, `manifest.webmanifest`, `index.html`, `tests/` | 5 do 7 dni | plus około 5 do 10 zł |
| 4. Maile | Szkice maili do klientów i jednostek, ostrzeżenia o brakującej dokumentacji SGS z poczty, anonimizacja | `api/mail/`, `anon.js` | 6 do 8 dni | plus około 15 do 30 zł |
| 5. Hotele i rozliczenia | Propozycje noclegów (linki wyszukiwania z datą i miejscem, bez rezerwacji), koszty podróży do rozliczenia | `api/travel/`, `app.js` (rozliczenia) | 5 do 7 dni | plus około 5 zł |

Każdy etap: testy na danych syntetycznych, wdrożenie na podgląd PR z listami `_TEST`, krótki raport i jedno zatwierdzenie właściciela.

**Etap 2 w dwóch częściach (25.11.2026).**

* **2a, bez modelu (zbudowane, staging):** przycisk „Inne terminy” liczy 3 warianty w kodzie (`PlanningCore.variants`). Reguły twarde odrzucają dzień: niedziela, nocleg w tygodniu opieki, minimum wysyłki planu. Miękkie obniżają ocenę i trafiają do uzasadnienia. Bloki na raporty (`PlanningCore.reportBlocks`) wypełniają wolne okna dnia pracy po audycie, przed terminem jednostki, a brak czasu daje ostrzeżenie. Koszt 0 zł.
* **2b, z modelem:** rozmowa z agentem („przesuń Grajewo na przyszły tydzień”), który korzysta z tych samych funkcji jako narzędzi, oraz szkice w `PlanDrafts` i `ChangeLog`. Wymaga Azure Functions, Key Vault i klucza API Anthropic. Klucz zakłada właściciel w konsoli Anthropic i sam wpisuje go do Key Vault.
* **2b, zbudowane (staging, czeka na klucz):** okno „Asystent planowania” w Planowaniu. Serwer to zintegrowane API Static Web Apps (`api/src/functions/agent.js`): sprawdza token Microsoft właściciela, trzyma klucz i definicje narzędzi, woła Claude Opus 5.5. Narzędzia (`pobierz_tydzien`, `szukaj_audytow`, `inne_terminy`, `pobierz_reguly`, `zaproponuj_zmiane`) wykonuje przeglądarka w `planning-agent.js` na tych samych funkcjach co ekran. Nazwy klientów idą do modelu jako pseudonimy KL-..., tematy spotkań z kalendarza nie są wysyłane. Agent niczego nie zapisuje: propozycja to karta z przyciskiem do karty audytu. Zamiast osobnych Functions i Key Vault: klucz w ustawieniach aplikacji Static Web Apps (zaszyfrowane, poza repozytorium), bez nowych zasobów. `PlanDrafts` i `ChangeLog` przy pierwszym zapisie z poziomu agenta.
* **Blokada bezstronności** wymaga kartoteki klientów (lista `Clients` z polem DoradczyLF). Ta kartoteka jest gotowa na starej gałęzi `staging` (commit 058c54c), ale nie jest scalona z produkcją.

### Szacunek kosztu modelu

Założenie: około 20 audytów i 40 spotkań miesięcznie, czyli około 30 sesji planowania po około 10 kroków. Krok to około 25 tysięcy tokenów wejścia (w tym około 20 tysięcy z pamięci podręcznej promptu) i około 1,5 tysiąca tokenów wyjścia.

* Claude Opus 5.5 (4 USD za milion wejścia, 20 USD za milion wyjścia, odczyt z pamięci 0,20 USD): około 0,54 USD na sesję, około 16 do 20 USD miesięcznie za planowanie. Z codzienną odprawą i przeglądem poczty (tańszy model Haiku) łącznie około 20 do 40 USD, czyli około 80 do 160 zł.
* Claude Sonnet 5.5: mniej więcej połowa tej kwoty.
* Azure Functions w planie zużycia i Key Vault: kilka złotych lub zero.
* Skanowanie dokumentów z iPhone (zdjęcie lub PDF, odczyt pól przez model): strona to około 1600 tokenów wejścia i około 600 wyjścia. Na Opus 5.5 około 0,02 USD za stronę, czyli przy 200 stronach miesięcznie około 15 zł, przy 1000 stronach około 75 zł. Skan dokumentu ze zdjęcia nie da się zanonimizować przed odczytem, więc trafia do modelu w całości.
* Łącznie z planowaniem, pocztą, głosem i skanowaniem 200 stron: około 100 do 180 zł miesięcznie na Opus 5.5.

## 7. Prywatność i dane w UE

* Przed wysłaniem do modelu nazwy klientów, osoby, adresy e-mail i telefony zastępowane są pseudonimami z `Clients` (KL-0042, OS-1). Odwrotne podstawienie robi backend.
* Do modelu trafiają tylko daty, czasy dojazdu, miasta i reguły. Adres dokładny tylko gdy jest potrzebny do trasy, i wtedy do usługi map, nie do modelu.
* Dane w SharePoint i Functions zostają w UE. Uwaga: bezpośrednie API Anthropic nie ma opcji przetwarzania wyłącznie w UE (dostępne są tylko „global” i „us”). Jeśli wymagane jest przetwarzanie modelu wyłącznie w UE, trzeba sprawdzić dostępność Claude w Microsoft Foundry w regionie UE. Decyzja w pytaniach do właściciela.
* CU nie ma podłączonej poczty. Dane CU pochodzą z pliku kwartalnego.

## 8. Mapy: Azure Maps czy Google Maps

| Kryterium | Azure Maps | Google Maps |
|---|---|---|
| Rozliczenie | ta sama subskrypcja Azure i faktura | osobne konto Google Cloud i karta |
| Logowanie | Entra ID, bez klucza w przeglądarce | klucz API |
| Dane w UE | zasób w regionie UE | usługa globalna |
| Macierz odległości | Route Matrix, 1 transakcja za 4 komórki | Compute Route Matrix, opłata za element, darmowo 10 tysięcy elementów miesięcznie (Essentials), potem około 5 USD za tysiąc |
| Darmowy próg | miesięczny próg Gen2 (dokładną liczbę dla Route Matrix trzeba sprawdzić w kalkulatorze) | jak wyżej |
| Jakość dróg w Polsce | dobra | bardzo dobra, najlepszy ruch drogowy |

Szacunek zużycia: 2 bazy i około 60 lokalizacji miesięcznie. Pełna macierz to około 3800 komórek raz, czyli około 950 transakcji Azure, potem prawie wszystko z `TravelCache`. W obu usługach mieści się w darmowym progu.

**Nawigacja i CarPlay.** Usługa map w backendzie tylko liczy kilometry i czasy dojazdu do planu. Do jazdy służy aplikacja na iPhone: link trasy w aplikacji i miejsce w zaproszeniu otwierają aplikację Google Maps, która wyświetla się w CarPlay. Kalendarz iPhone przy zaproszeniu z adresem podpowiada też, kiedy wyjechać. Wybór Azure czy Google nie zmienia więc nic w samochodzie.

**Rekomendacja: Azure Maps.** Ten sam dzierżawca i faktura, logowanie Entra ID bez klucza, zasób w UE. Google zostaje opcją, gdyby czasy dojazdu Azure okazały się wyraźnie niedokładne (łatwa zamiana, bo dostęp idzie przez jedno narzędzie `odleglosc`).
