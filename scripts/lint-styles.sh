#!/usr/bin/env bash
# lint-styles.sh — pilnuje design systemu LF Assurance w AuditCRM.
# Zgłasza: kolory HEX / rgb() / hsl() oraz font-family poza plikami tokenów.
# Wyjątek na linię: dopisz komentarz  lfa-allow  (np. kolory markerów Leaflet).
# Użycie: ./scripts/lint-styles.sh  [--strict]   (--strict = kod wyjścia 1 przy znaleziskach)
set -u
cd "$(dirname "$0")/.." || exit 2

FILES="style.css app.js index.html"
ALLOW_RE='lfa-allow'
fail=0; total=0

report() { # $1 label, $2 regex, $3 files
  local hits
  hits=$(grep -nE "$2" $3 2>/dev/null | grep -vE "$ALLOW_RE" || true)
  if [ -n "$hits" ]; then
    local n; n=$(printf "%s\n" "$hits" | wc -l | tr -d ' ')
    total=$((total + n)); fail=1
    printf "\n\033[1m%s\033[0m — %s wystąpień\n" "$1" "$n"
    printf "%s\n" "$hits" | head -40
    [ "$n" -gt 40 ] && printf "… i %s więcej\n" "$((n - 40))"
  fi
}

report "HEX poza tokenami"            '#[0-9a-fA-F]{3}([0-9a-fA-F]{3}([0-9a-fA-F]{2})?)?\b' "$FILES"
report "rgb()/rgba()/hsl() poza tokenami" '\b(rgba?|hsla?)\(' "$FILES"
# font-family tylko przez tokeny (var(...)) lub inherit — BSD grep bez lookahead, więc dwustopniowo
ff=$(grep -nE 'font-family\s*:' style.css index.html 2>/dev/null | grep -vE 'font-family\s*:\s*(var\(|inherit)' | grep -vE "$ALLOW_RE" || true)
if [ -n "$ff" ]; then n=$(printf "%s\n" "$ff" | wc -l | tr -d ' '); total=$((total+n)); fail=1; printf "\n\033[1mfont-family z nazwą poza tokenami\033[0m — %s wystąpień\n" "$n"; printf "%s\n" "$ff" | head -40; fi
report "Marka LogisticFit w UI"        'LogisticFit|Bricolage|Work Sans|Geist|Poppins|#3a4d98|#239d46' "style.css index.html"

if [ "$fail" -eq 0 ]; then
  printf "\033[32m✔ lint-styles: czysto — wszystkie kolory i fonty z tokenów --lfa-*\033[0m\n"; exit 0
fi
printf "\n\033[31m✖ lint-styles: %s znalezisk. Zastąp tokenami --lfa-* (design/tokens/app.css).\033[0m\n" "$total"
[ "${1:-}" = "--strict" ] && exit 1 || exit 0
