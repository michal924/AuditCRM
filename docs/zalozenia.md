# Założenia LFA Hub

Każde założenie przyjęte bez pytania właściciela. Kolumna „Jak łatwo zmienić” mówi, ile kosztuje odwrócenie decyzji.

| Założenie | Powód | Jak łatwo zmienić |
|---|---|---|
| Testy uruchamiane przez JavaScriptCore z macOS, bez Node | Na komputerze nie ma Node, a skrypt ma działać od zera | Łatwo: te same testy można odpalić w Node w GitHub Actions |
| Testy tylko na danych syntetycznych | Poufność klientów, repozytorium jest w GitHub | Łatwo |
| Staging to podgląd pull requesta z listami `_TEST`, nie gałąź `staging` | Workflow wdraża tylko `main` i pull requesty do `main` | Łatwo: dopisać gałąź w workflow |
| Agent działa w backendzie Azure Functions, nie w przeglądarce | Klucz modelu i drugi kalendarz nie mogą być dostępne z przeglądarki | Trudno: to podstawa architektury |
| Region Azure: Poland Central, zapasowo West Europe | Dane w UE, blisko użytkownika | Łatwo przed etapem 1, trudniej po |
| Model: Claude Opus 5.5, do prostych zadań Haiku 5.5 | Najlepsze rozumowanie przy regułach i konfliktach, koszt niski przy tej skali | Łatwo: jedno ustawienie |
| Agent zapisuje tylko szkice w `PlanDrafts`, zatwierdza człowiek | Zasada „bez zgody nigdy” z wytycznych | Celowo trudno |
| Reguły planowania w liście `PlanningRules` | Właściciel ma je zmieniać bez programisty | Łatwo |
| Kartoteka `Clients` i `ClientSites` jako nowe listy, audyty dostają `ClientId` stopniowo | Anonimizacja, bezstronność i wiele lokalizacji wymagają jednego rekordu klienta | Średnio |
| Pseudonim klienta w formacie KL-0000 | Prosty, stały, bez danych osobowych | Łatwo |
| Mapy: Azure Maps z pamięcią `TravelCache` | Ten sam dzierżawca i faktura, mieści się w darmowym progu | Łatwo: jedno narzędzie `odleglosc` |
| Bazy startowe: centrum Trzemeszna i adres biura w Warszawie | Brak dokładnych adresów w wytycznych | Łatwo: wartość w `PlanningRules` |
| Kalendarz LF Assurance to skrzynka, na którą logujesz się do aplikacji | Tak działa dziś odczyt zajętości | Łatwo |
| Kalendarz LogisticFit czytany przez uprawnienie do drugiej skrzynki w tym samym dzierżawcy | Jeden dzierżawca M365, dwie skrzynki | Średnio: wymaga zgody administratora |
| Hotele: linki wyszukiwania z datą i miejscem, bez rezerwacji | Brak otwartego API rezerwacji, rezerwacja wymaga zgody | Łatwo |
| Głos z iPhone: dyktowanie iOS zamienione na tekst przed agentem | Bez nowej płatnej usługi mowy | Łatwo |
| Koszty w zł przeliczone po około 4 zł za USD | Szacunek | Łatwo |
