# LF Assurance — zasady marki w AuditCRM

Źródło: Księga marki LF Assurance v2 (lipiec 2026), pakiet `export/lf-assurance-brand` z 2026-09-21.
Ten katalog jest **jedynym źródłem prawdy** dla wyglądu aplikacji. Claude Code czyta go na początku każdej sesji UI.

## Pliki

| Plik | Rola | Kto edytuje |
| --- | --- | --- |
| `tokens/tokens.css` | tokeny marki z pakietu (6 kolorów, fonty, odstępy) | nikt ręcznie — aktualizacja tylko przez podmianę pakietu |
| `tokens/brand.json` | te same wartości maszynowo | jak wyżej |
| `tokens/app.css` | warstwa aplikacyjna: role semantyczne, statusy, jednostki, kalendarz, tryb ciemny — **wszystko wyprowadzone z palety** | deweloper / Claude Code, po przeglądzie |
| `COMPONENTS.md` | katalog komponentów (klasy CSS `.lfa-*`) z wariantami i stanami | deweloper / Claude Code |
| `assets/logo/*.svg` | znak, lockupy, favicon, negatyw, mono | nikt — z pakietu |
| `../fonts/lfa/` | Archivo + IBM Plex Mono (TTF, OFL) + `lfa-fonts.css` | nikt |

Kolejność ładowania w `index.html`: `fonts/lfa/lfa-fonts.css` → `design/tokens/tokens.css` → `design/tokens/app.css` → `style.css`.

## Paleta — sześć kolorów, każdy z jedną rolą

| Token | HEX | Rola | Udział |
| --- | --- | --- | --- |
| `--lfa-granat` | `#16263F` | kolor główny: nagłówki, duże pola, tekst wiodący, **przyciski główne** | 28% |
| `--lfa-bordo` | `#6E1F2C` | akcent: oficjalność, ostrzeżenia, kolizje, akcje drugorzędne; oszczędnie | 9% |
| `--lfa-mosiadz` | `#A6864E` | detal: cienkie linie, daty, sygnatury; **jednostka SGS** | 5% |
| `--lfa-papier` | `#F5F3EE` | tło podstawowe (ciepła kość) | 58% |
| `--lfa-szary` | `#6C6A63` | tekst pomocniczy, metadane, stany zamknięte | — |
| `--lfa-atrament` | `#1E2024` | tekst podstawowy (miękka czerń) | — |

Helpery z księgi: `--lfa-mosiadz-jasny #C9A46A`, `--lfa-granat-deep #0F1B2E`, `--lfa-bordo-deep #571620`.

### Reguły kolorów

- Granat prowadzi, bordo iskrzy punktowo, mosiądz to detal. **Nigdy pół na pół** granat/bordo.
- Żadnych kolorów spoza palety. Każdy odcień w `app.css` to `color-mix()` lub przezroczystość koloru z palety.
- Nie ma zieleni. **Sukces = granat + tekst/ikona ✓** (status zawsze komunikowany słowem, nie samym kolorem).
- Jednostki: **CU = granat, SGS = mosiądz**. Nie mylić z LogisticFit (granat + zieleń) — to osobna marka, osobne tokeny, zero importów.
- Czysta czerń tylko w druku jednokolorowym; na ekranie tekst = atrament.

## Typografia

- **Archivo** — całe UI. Body 400, wyróżnienia 500, **nagłówki i logo 600**, akcent 700. H1 wersaliki z trackingiem +5%, H2 +3%.
- **IBM Plex Mono** — dane: kwoty, km, PRJ, daty, sygnatury, eyebrow (uppercase, tracking .16–.28em).
- Minimalny rozmiar tekstu w UI: 11px. Body 14px.
- Do PDF (jsPDF) używać TTF z `fonts/lfa/` — Google Fonts nie działa w PDF.

## Logo

- Znak: lupa z globusem (globus liniowy granat, obręcz i rączka bordo). Wordmark: „LF" bordo, „ASSURANCE" granat, ścieżki wektorowe.
- Lockup poziomy (`02`) min. **180 px** na ekranie / 32 mm w druku. Poniżej — sam znak (`01`).
- Na ciemnym tle — wyłącznie negatyw (`07`, `08`) w kolorze Papier. Nigdy nie przekolorowywać znaku.
- Favicon: `04_favicon.svg` (pole granat, znak Papier).
- Pieczątka / druk jednokolorowy: `05`, `06` (granat).

## Tryb ciemny

Tło `granat-deep`, powierzchnie `granat`, tekst `Papier`, primary = Papier z granatowym tekstem, bordo i mosiądz rozjaśnione mieszanką z Papierem. Wszystko przez tokeny w `app.css` — komponenty nie mają własnych reguł dark.

## Dostępność

Kontrast WCAG AA (4.5:1, duży tekst 3:1) w obu trybach · widoczny focus (`--lfa-focus-ring`) · etykiety pól zawsze widoczne · status tekstem · cel dotyku ≥ 44 px · działa od 360 px szerokości.

## Ton tekstów UI

Po polsku, krótko, bez myślników w zdaniach, przyciski to czasowniki („Zapisz zmiany", „Rozlicz audyt"), jeden primary na ekran.
