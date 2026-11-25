# LFA Hub: brief nowego layoutu

Dokument wejściowy dla sesji Claude Code, która projektuje i wdraża nowy układ aplikacji. Zawiera pełny spis tego, co aplikacja ma dziś, proponowaną nową strukturę, zasady i plan wdrożenia w etapach.

Stan na 25.11.2026, gałąź `hub-etap1`. Spis zrobiony z `index.html`, `app.js`, `planning-ui.js`, `planning-agent.js` i `style.css`. Numery linii mogą się przesunąć, dlatego szukaj po nazwach funkcji i identyfikatorach.

## 0. Jak pracować z tym dokumentem

1. Przeczytaj `CLAUDE.md`, `design/README.md`, `design/COMPONENTS.md`, `design/components.css`, `design/tokens/app.css`.
2. Przeczytaj ten brief w całości. Sekcja 3 to spis treści aplikacji: **nic z niego nie może zniknąć** przy zmianie układu, chyba że właściciel wprost to usunie.
3. Zanim zaczniesz kodować, pokaż właścicielowi makietę nowej nawigacji i jednego ekranu (punkt 6, etap A) i poczekaj na decyzję.
4. Pracuj na gałęzi `hub-layout` (gałęzie `hub-*` wdrażają się na staging z listami `_TEST`). Produkcja to push do `main` i wymaga zgody właściciela.
5. Każdy etap kończy się testami (`./scripts/test.sh`), sprawdzeniem w trybie jasnym i ciemnym oraz przy 360 px, krótkim raportem i jednym pytaniem o zatwierdzenie.

## 1. Cel

* Jedna spójna aplikacja w marce **LF Assurance** (granat, bordo, mosiądz, papier, Archivo i IBM Plex Mono) zamiast mieszanki starych klas LogisticFit i nowych `.lfa-*`.
* Prostsza nawigacja: dziś jest 10 zakładek w jednym pasku plus 3 przyciski akcji. Na telefonie to się nie mieści.
* Telefon jako pełnoprawne urządzenie: audytor korzysta z aplikacji w drodze (PWA na iPhone, w przyszłości głos i CarPlay).
* Wszystkie ekrany zbudowane z komponentów `.lfa-*`. Wzorem jest ekran Planowanie, jedyny już w pełni zgodny.

## 2. Zasady, których nie wolno złamać

Z `CLAUDE.md` i `design/README.md`:

* Kolory, fonty, odstępy, promienie, cienie **tylko z tokenów `--lfa-*`**. Zero HEX, `rgb()` i surowych px poza tokenami, także w JS i w atrybutach `style=`.
* Ekrany składane z komponentów `.lfa-*`. Brakuje komponentu albo wariantu? Najpierw propozycja w `design/COMPONENTS.md` i `design/components.css` (osobny commit), potem użycie.
* Jeden `.lfa-btn.primary` na ekran. Bordo dla akcji oficjalnych. Mosiądz to detal i jednostka SGS. Sukces to granat i znak ✓, **nie ma zieleni**.
* Status zawsze słowem, nie samym kolorem. Kontrast WCAG AA, widoczny focus, etykiety pól zawsze widoczne, cel dotyku co najmniej 44 px.
* Działa od 360 px bez poziomego przewijania strony. Tabele przewijają się w swoim kontenerze.
* Tryb jasny i ciemny (`[data-theme]` oraz `prefers-color-scheme`).
* Teksty po polsku, krótkie, bez myślników w zdaniach, przyciski to czasowniki.
* CU i SGS to odrębne jednostki. Trzecia to LogisticFit (zlecenia od spółki). Nazwy bierz z `certBodyOf()` i `BODY_INFO`, nigdy nie zakładaj „tylko CU”.
* Nie używaj tokenów, logo ani kolorów marki LogisticFit.
* Nowe pole SharePoint w liście `Audits` musi trafić do `$select` (`fetchAuditsWithSelect`, `SETTLE_FIELDS`).
* Zmiana layoutu **nie zmienia logiki ani danych**. Funkcje zapisu, importu, eksportu, PDF i zaproszeń zostają te same, zmienia się tylko HTML, klasy i układ.
* Prywatność: nazwy klientów i adresy e-mail nie trafiają do commitów, testów ani zrzutów w dokumentacji.

## 3. Spis treści aplikacji (wszystko musi się znaleźć w nowym układzie)

### 3.1 Powłoka

* **Logowanie** (`#page-login`): znak, nazwa, podpis „Planowanie i rozliczanie audytów”, przycisk „Zaloguj się przez Microsoft”.
* **Pasek środowiska testowego** (`#test-banner`, tylko staging i lokalnie): opis list `_TEST`, przyciski „Utwórz / uzupełnij listy TEST” i „Nadpisz dane TEST kopią produkcji”. Musi zostać wyraźny, żeby nie pomylić środowisk.
* **Nawigacja** dziś: Pulpit, Audyty, Kalendarz, Planowanie, Check Audyt, Zmiany Audytora, Opieka, Mapa audytów, Finanse, Klienci (na razie tylko staging, stała `CLIENTS_ENABLED`).
* **Akcje globalne**: Import CUC, Rozliczenie, Dodaj audyt.
* **Konto**: nazwa użytkownika, przełącznik motywu, Wyloguj.
* **Zgłoszenia rozwoju**: pływający przycisk 💡 otwiera okno zgłoszeń (lista `DevRequests`).
* **Toast** komunikatów (dziś stara klasa `.toast`, docelowo `.lfa-toast`).
* Potwierdzenia przez `confirm()` i nowy klient przez `prompt()`. Docelowo własne okno potwierdzenia z komponentów (do zaproponowania jako komponent).

### 3.2 Pulpit (`DashboardModule`)

* Karta **Dziś**: data, audyt albo spotkanie albo „Dzień bez audytu” albo weekend, jednostka, program, miasto, dni, opieka, do 4 wydarzeń z Outlooka. Klik otwiera audyt.
* **Najbliższe 14 dni**: wiersz na dzień z chipami audytów, opieki, Outlooka, kolizji z opieką, „wolny”, „weekend”.
* **Do zrobienia**: kafle z licznikiem i listą (do zaplanowania, plan audytu niewysłany, zaległe statusy, do rozliczenia z kwotą, proforma do wysłania, certyfikaty do pilnowania). Klik przechodzi do Audytów z ustawionymi filtrami. Pusty stan „Nic nie czeka”.
* **Rok w liczbach**: kafle (Rozliczone, Wysłane, Do rozliczenia, Prognoza, Zaległe), pasek roku według kategorii, dni audytowe według jednostki, przejście do Finansów.

### 3.3 Audyty (`renderTable`, `SideCalModule`)

* **Filtry**: wyszukiwarka firmy; listy wielokrotnego wyboru Kwartał, Miesiąc, Rok, Program, Jednostka, Status, Plan audytu, Rozliczenie; „Wyczyść”. Stan filtrów pamiętany w przeglądarce. Lata są dziś wpisane na sztywno (2024 do 2026), docelowo z danych.
* **Liczniki**: Łącznie, Planned, Scheduled, Wykonane, Do proformy.
* **Tabela** (14 kolumn, sortowanie): PRJ, Firma, Program (jednostka, program, „łączony”), Typ, Data CU, Data audytu LF (opieka, godziny), Cert. ważny do (klik otwiera formularz certyfikatu), Miasto, Tryb, Status, Proforma, Plan audytu, Rozliczenie, Notatki. Kolor wiersza to jednostka, jasność to status. Klik otwiera okno audytu. Pokazuje tylko audyty właściciela.
* **Kalendarz boczny**: zwijany, miesiąc, przełącznik jednostki, siatka dni ze stanami (CU, SGS, oba, LF, zajęty, wolny, weekend, opieka, kolizja, dziś), szczegóły dnia, legenda, najbliższe wolne dni. Wybór dnia filtruje tabelę.
* Na telefonie tabela zamienia się w karty.

### 3.4 Kalendarz (`AuditCalModule`)

* Widoki Miesiąc, Tydzień, Rok. Przełącznik jednostki. Nawigacja poprzedni i następny. Warstwa Outlooka (włącz lub wyłącz).
* Komórki: wolny, święto (polskie święta liczone w kodzie), opieka, do 3 audytów i „+N”, do 2 wydarzeń Outlooka. Odwołane audyty pominięte. Klik w audyt otwiera okno audytu. Legenda.

### 3.5 Planowanie (`PlanningModule`, `PlanningCore`, `PlanningAgent`)

Już na komponentach `.lfa-*`. Zachować całość:

* Tydzień z nawigacją, przycisk Reguły, notka „podgląd, nic nie zmienia”.
* Komunikaty: błędy reguł i kalendarzy, brak czasu na raport, zgoda na Azure Maps, geokodowanie.
* **Asystent planowania**: rozmowa, pole pytania (Ctrl lub Cmd i Enter), „Nowa rozmowa”, „Zapytaj”, karty propozycji z przyciskiem „Otwórz kartę audytu”, stany narzędzi. Pseudonimy klientów.
* **Dni tygodnia**: zajętość z kalendarzy, audyty z dojazdem (km, czas, źródło), ustalenia reguł (blokada, uwaga, informacje), „Inne terminy”, propozycje bloków na raporty, „Wolny”.
* Okna: Reguły planowania (tabela reguł, zapis do listy `PlanningRules`) i Inne terminy (3 warianty z uzasadnieniem).

### 3.6 Check Audyt (`renderAuditorsTable`)

* Kwartał i rok. Tabela audytorów: FSC, PEFC, KZR INiG, SURE, EUDR, Łącznie. Wiersz właściciela wyróżniony.

### 3.7 Zmiany audytora (`setupChanges`, `renderChangesTable`)

* Filtry: audytor, program, rok, „tylko zmiany”. Raport PDF zmian.
* Wgrywanie plików Auditsoverview2XL (kilka naraz), chipy wczytanych lat, „Wyczyść dane”. Dane w przeglądarce.
* Tabela: PRJ, Firma, Program, kolumna na rok, Zmiana.
* Do poprawy przy okazji: nagłówek PDF tego raportu ma napis „LOGISTICFIT” i jeden kolor RGB wpisany na sztywno (`generatePdfRzeznik`).

### 3.8 Opieka (`OpiekaModule`)

* Widoki Rok, Miesiąc, Tydzień. Ustawienia (godzina przekazania, początki ferii na 4 lata). Eksport .ics.
* Baner dziś („u ojca” albo nie, powód, najbliższe przekazanie). Najbliższe przekazania. Reguły opieki. Legenda.
* `OpiekaModule.dayInfo()` zasila opiekę w całej aplikacji. Nazwa zakładki zawiera imię dziecka: zostaw tak, jak jest w kodzie, nie przenoś do dokumentacji.

### 3.9 Mapa audytów (`MapModule`)

* Filtry Status, Rok, Kwartał, Program. Mapa Leaflet, kółko na miasto (wielkość to liczba, kolor to dominujący status), dymek z listą. Lista boczna według miast, legenda. Status geokodowania.
* Dymki i lista mają dziś style wpisane w JS. Do przeniesienia na tokeny.

### 3.10 Finanse (`FinanceModule`, `DelegModule`)

* Przełącznik jednostki, filtry (Rok, Miesiąc, Kwartał, Program, Kategoria, Rodzaj), „Narzędzia rozliczeń”.
* **Do zrobienia**: audyty odbyte bez DONE (przyciski DONE i REJECTED), pozycje z planu CU bez terminu LF („Ustaw termin”, REJECTED).
* Kafle: Zarobione, Do rozliczenia, Zaplanowane, Plan roku.
* **Wykres** planu według miesięcy (SVG, klik wybiera miesiąc) i **tabela miesiąc po miesiącu** (Zarobione, Do rozliczenia, Zaplanowane, Wstępnie, Razem, Narastająco, Dni, Koszty).
* **Delegacje**: okres, zakres, spotkania i szkolenia, zestawienie PDF, oświadczenia za okres, kafle (wyjazdy, dni, km, noclegi, pominięte), tabela delegacji z przyciskiem oświadczenia.
* **Audyty w miesiącu**: lista z kosztami i wynagrodzeniem.

### 3.11 Klienci (`ClientsModule`, na razie tylko staging)

* Wyszukiwarka, „Wyodrębnij klientów z audytów”, „Nowy klient”, konfiguracja listy.
* Lista klientów (ostrzeżenie o certyfikacie w ciągu 90 dni) i karta klienta: 4 kafle, dane klienta z polem „Klient doradczy LogisticFit (bezstronność)”, certyfikaty i terminy, audyty wszystkich jednostek, miejsce na dokumenty.
* Tryb propozycji: tabela klientów do utworzenia i podpięcia audytów.
* Cały moduł na starych klasach `cl-*`. Do przebudowy na `.lfa-*` razem z layoutem.

### 3.12 Okna (modale)

| Okno | Co zawiera | Uwagi |
|---|---|---|
| **Audyt** (`openModal`, `saveChanges`) | podgląd i edycja; sekcje Dane firmy, Planowanie (data, zajętość dnia, godziny, dni, tryb, plan PDF, zaplanuj i wyślij zaproszenie), Notatki, Rozliczenie (zwijane, koszty, wynagrodzenie, status rozliczenia); grupy Status, Proforma, Plan audytu, Raport wysłany do jednostki; przyciski Przełóż termin, Odwołaj audyt, Usuń wpis, Scal w audyt łączony, Oświadczenie o delegacji, Zapisz zmiany | najważniejsze okno aplikacji; na telefonie pełny ekran; ochrona przed utratą zmian; zapis pyta o przeniesienie wydarzenia w Outlooku |
| **Dodaj audyt** | firma z podpowiedziami, jednostka, numer (etykieta zależna od jednostki), program, podmiot EUDR, rodzaj, typ, adres; planowanie z opieką i zajętością dnia; status; notatki | klik w tło nie zamyka |
| **Import CUC** | plik .xlsx, wsad CSV (SGS i inni), podgląd z różnicami (nowe, bez zmian, do usunięcia, chronione), potwierdzenie usunięć, postęp, wynik | import nie nadpisuje istniejących audytów |
| **Plan audytu z PDF** | odczytane pola z checkboxami, „Wstaw do formularza” | |
| **Certyfikat** | klient, system, jednostka, numer, ważność, status w bazie, „Sprawdź w bazie” | |
| **Zgłoszenia rozwoju** | tytuł, opis, wyślij, lista zgłoszeń ze statusem | |
| **Rozliczenie** | miesiąc, okres (cały, 1 do 15, 16 do końca), tylko DONE, jednostka, odwołane, stawki dzienne, eksport .xlsx, raport PDF do faktury (dwa układy), podsumowanie, import historycznych rozliczeń, raporty roczne | tytuł mówi „CU / SGS”, a obejmuje też LogisticFit |
| **Oświadczenie o delegacji** | wyjazd, powrót, miejsca, cel, środek transportu, numer, PDF | |
| **Reguły planowania**, **Inne terminy** | już na `.lfa-modal` | wzór dla reszty |

### 3.13 Pojęcia, które interfejs musi pokazywać

* Status audytu: PLANNED, SCHEDULED, DONE, REJECTED, CHANGE.
* Proforma: Brak, Wysłana, Zapłacona. Plan audytu wysłany (data). Raport wysłany do jednostki (data).
* Rozliczenie: Nierozliczony, Wysłany do CU, SGS albo LogisticFit (`settleStatusLabel`), Rozliczony. Miesiąc rozliczenia.
* Jednostki: CU (granat), SGS (mosiądz), LogisticFit (trzeci kolor już w stylach).
* Programy: FSC CoC, PEFC CoC, KZR INiG, SURE, EUDR, łączony.
* Rodzaj wpisu: Audyt, Spotkanie, Szkolenie. Tryb: On-site, Online. Rola EUDR: Operator albo DO.
* Certyfikaty: ważny, zawieszony, wygasły, wycofany; poziomy W porządku, Do zaplanowania, Pilne.
* Opieka, dni wolne, święta, zajętość z Outlooka, kolizje.
* Ustalenia planowania: blokada, uwaga, informacja; źródło dojazdu (Azure Maps, szacunek, do miasta).

### 3.14 Eksporty i dokumenty (wygląd PDF poza zakresem layoutu, ale nie mogą się zepsuć)

Rozliczenie .xlsx (miesiąc, nierozliczone), raport PDF do faktury (układ C i A), raport zmian PDF, zestawienie delegacji PDF, oświadczenia PDF, kalendarz opieki .ics, wydarzenia w Outlooku. Zapis plików przez `saveBlobFile` (na iPhone arkusz udostępniania).

## 4. Problemy do naprawienia przy nowym layoucie

1. **Telefon, dolny pasek**: 9 zakładek plus Rozliczenie przypięte w ostatnim polu. Rozliczenie prawdopodobnie zasłania Finanse. Ze stagingową zakładką Klienci jest 11 pozycji.
2. **Telefon, karty audytów**: etykiety pól są przesunięte o jedną kolumnę od czasu dodania „Cert. ważny do” (reguły `::before` w `style.css`, blok do 768 px). Kolumna Miasto jest ukryta zamiast Typu.
3. **Import CUC niedostępny na telefonie** (przycisk ukryty).
4. Wiersz „ładowanie” w tabeli ma `colspan="9"` przy 14 kolumnach.
5. Zbędny nawias `}` w `style.css` zaraz po bloku 769 do 1600 px.
6. Ukryty, nieużywany podgląd wiersza w tabeli audytów (`#preview-{id}`). Do usunięcia albo świadomego użycia.
7. Lata w filtrach wpisane na sztywno.
8. Style wpisane w JS i w atrybutach `style=` (mapa, import, dodawanie audytu, przyciski `width:auto`).
9. Toast tylko w wariantach sukces i błąd. Komponent `.lfa-toast` istnieje, ale nie jest użyty.
10. Nagłówek PDF raportu zmian z napisem „LOGISTICFIT” i kolorem RGB.

## 5. Proponowana nowa struktura (do potwierdzenia przez właściciela)

### 5.1 Nawigacja według zadań, nie według modułów

| Obszar | Co w nim jest | Dzisiejsze zakładki |
|---|---|---|
| **Dziś** | pulpit: dziś, 14 dni, do zrobienia, rok w liczbach | Pulpit |
| **Audyty** | lista z filtrami i kalendarzem bocznym; okno audytu | Audyty |
| **Plan** | przełącznik: Tydzień (planowanie z asystentem), Miesiąc, Rok (kalendarz), warstwy Outlook i Opieka | Planowanie, Kalendarz |
| **Klienci** | kartoteka, certyfikaty, mapa (przełącznik Lista albo Mapa) | Klienci, Mapa |
| **Finanse** | przegląd, rozliczenie miesiąca (dziś okno, docelowo ekran), delegacje | Finanse, Rozliczenie |
| **Więcej** | Opieka, Check Audyt, Zmiany audytora, Import CUC, Zgłoszenia rozwoju, ustawienia (motyw, wyloguj) | reszta |

* **Komputer**: lewy pasek boczny z sześcioma obszarami (ikona i nazwa, zwijany do samych ikon), na górze pasek z wyszukiwarką audytów i klientów, przyciskiem „Dodaj audyt” (jedyny primary w powłoce) i kontem.
* **Telefon**: dolny pasek z 5 pozycjami (Dziś, Audyty, Plan, Finanse, Więcej) plus pływający przycisk „Dodaj audyt”. Klienci w Więcej albo zamiast Finansów, do decyzji właściciela.
* Rozliczenie przestaje być oknem z paska. Staje się kartą w Finansach z linkiem z okna audytu.
* Import CUC dostępny także na telefonie, w Więcej.
* Opieka przestaje być osobną główną zakładką: jest warstwą w Planie i ekranem w Więcej (ustawienia, eksport .ics).

### 5.2 Wzorce ekranów

* **Nagłówek ekranu**: tytuł, krótki opis stanu (np. „Tydzień 48 · 23.11 do 29.11”), akcje po prawej, na telefonie zawijane.
* **Pasek filtrów**: `.lfa-chip` i `.lfa-menu`; na telefonie menu jako arkusz od dołu.
* **Listy i tabele**: `.lfa-table` z `.lfa-row[data-body][data-status]`; na telefonie karty z poprawnymi etykietami.
* **Okno audytu**: na komputerze szeroki `.lfa-modal.form` albo panel boczny (do decyzji); na telefonie pełny ekran z przyklejonym na dole paskiem Zapisz. Sekcje jako `.lfa-section`.
* **Puste stany**: `.lfa-empty` z jedną akcją.
* **Potwierdzenia**: nowy komponent okna potwierdzenia zamiast `confirm()` (do zaproponowania w `COMPONENTS.md`).

### 5.3 Komponenty, które prawdopodobnie trzeba dodać (najpierw propozycja w `COMPONENTS.md`)

* Pasek boczny nawigacji i dolny pasek telefonu (`.lfa-nav` istnieje, sprawdzić, czy wystarcza).
* Okno potwierdzenia (`.lfa-confirm`).
* Arkusz od dołu na telefonie dla filtrów i menu.
* Przełącznik segmentowy (`.lfa-seg` istnieje w `components.css`, brak opisu w `COMPONENTS.md`).
* Wiersz listy z akcją (lista miesiąca w Finansach, lista klientów, lista mapy).
* Propozycja bloku w kalendarzu (dziś blok raportu używa chipu jednostki z tekstem „propozycja”).

## 6. Plan wdrożenia w etapach

Każdy etap: gałąź `hub-layout`, staging, testy, jasny i ciemny, 360 px, raport, zatwierdzenie. Logika i dane bez zmian.

| Etap | Zakres | Jak sprawdzić |
|---|---|---|
| **A. Makieta** | makieta nawigacji (komputer i telefon) i ekranu Audyty w nowym układzie, jako statyczny HTML na tokenach w `design/mockups/`; lista nowych komponentów | właściciel wybiera wariant, zanim powstanie kod |
| **B. Powłoka** | nowa nawigacja (pasek boczny, dolny pasek, Więcej), pasek górny, toast `.lfa-toast`, okno potwierdzenia; stare widoki działają w nowej ramce | wszystkie dzisiejsze ekrany osiągalne w 2 kliknięciach, także Import na telefonie |
| **C. Audyty i okno audytu** | filtry na chipach, tabela `.lfa-table`, karty na telefonie z poprawnymi etykietami, okno audytu na `.lfa-modal` | zapis audytu, plan, rozliczenie, zaproszenia jak dotąd |
| **D. Plan** | połączenie Planowania i Kalendarza w jeden obszar z przełącznikiem widoku i warstwami | tydzień, miesiąc, rok, opieka, Outlook, asystent |
| **E. Finanse i rozliczenie** | Finanse, Rozliczenie jako ekran, Delegacje na komponentach | eksporty .xlsx i PDF identyczne jak przed zmianą |
| **F. Klienci i mapa** | kartoteka na `.lfa-*`, mapa jako widok w Klientach, style mapy na tokenach | włączenie Klientów na produkcji po zgodzie właściciela |
| **G. Pozostałe** | Opieka, Check Audyt, Zmiany audytora, Import, Zgłoszenia, logowanie; usunięcie starych klas i mostka zmiennych w `style.css` | `./scripts/lint-styles.sh` czysty; brak klas z tabeli migracji w `COMPONENTS.md` |

## 7. Kryteria odbioru

* Każdy punkt z sekcji 3 jest dostępny w nowym układzie.
* `./scripts/test.sh` przechodzi, `lint-styles.sh` bez znalezisk.
* Każdy ekran sprawdzony w trybie jasnym i ciemnym oraz przy 360, 768 i 1280 px, bez poziomego przewijania strony.
* Kontrast AA, widoczny focus, cele dotyku co najmniej 44 px, status opisany słowem.
* Jeden primary na ekran.
* Brak nowych HEX, `rgb()`, `style=` i stylów wpisanych w JS.
* Funkcje zapisu, importu, eksportu, PDF i zaproszeń działają identycznie (sprawdzone na stagingu na listach `_TEST`).
* Raport z etapu wymienia użyte komponenty `.lfa-*` i nowe tokeny lub warianty (gdzie dodane).

## 8. Pytania do właściciela przed etapem A

1. Komputer: pasek boczny po lewej czy zostaje pasek górny? Rekomendacja: pasek boczny.
2. Telefon: czwarta pozycja dolnego paska to Finanse czy Klienci? Rekomendacja: Finanse, Klienci w Więcej.
3. Okno audytu na komputerze: duże okno na środku (jak dziś) czy panel z prawej przy liście? Rekomendacja: panel z prawej, bo lista zostaje widoczna.
4. Czy Kalendarz i Planowanie łączymy w jeden obszar „Plan”? Rekomendacja: tak.
5. Czy Mapa idzie do Klientów? Rekomendacja: tak.
