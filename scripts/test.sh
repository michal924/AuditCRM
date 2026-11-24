#!/bin/zsh
# Testy LFA Hub bez Node: składnia wszystkich własnych plików JS + testy czytnika planów audytu.
# Silnik: JavaScriptCore z macOS (osascript -l JavaScript). Uruchom: ./scripts/test.sh
set -u
cd "$(dirname "$0")/.."
fail=0

# 1) Składnia własnych plików (bez bibliotek *.min.js, leaflet, msal)
for f in app.js api.js auth.js plan.js planning.js planning-ui.js sw.js tests/*.js; do
  res=$(osascript -l JavaScript -e "ObjC.import('Foundation'); var s=\$.NSString.stringWithContentsOfFileEncodingError('$PWD/$f',4,null); if (!s || !s.js) 'PUSTY PLIK'; else { try { new Function(s.js); 'OK' } catch (e) { '' + e } }")
  if [[ "$res" == "OK" ]]; then echo "✔ składnia  $f"; else echo "✘ składnia  $f: $res"; fail=1; fi
done

# 2) app.js nie może być pusty ani obcięty (ochrona przed przypadkowym nadpisaniem)
lines=$(wc -l < app.js | tr -d ' ')
if (( lines < 5000 )); then echo "✘ app.js ma tylko $lines linii — plik obcięty?"; fail=1; else echo "✔ app.js     $lines linii"; fi

# 3) Testy czytnika planów (plan.js) na syntetycznych tekstach
res=$(osascript -l JavaScript -e "
ObjC.import('Foundation');
var rd = function (p) { return \$.NSString.stringWithContentsOfFileEncodingError('$PWD/' + p, 4, null).js; };
var window = this;
eval(rd('plan.js').replace('const PlanReader =', 'var PlanReader ='));
eval(rd('tests/plan-reader.test.js'));
var o = runPlanTests(PlanReader);
(o.fails.length ? o.fails.join('\n') + '\n' : '') + 'SPRAWDZEŃ ' + o.checks + ', BŁĘDÓW ' + o.fails.length;
")
echo "$res" | sed 's/^/  /'
[[ "$res" == *"BŁĘDÓW 0"* ]] || fail=1

# 4) Testy logiki planowania (planning.js)
res=$(osascript -l JavaScript -e "
ObjC.import('Foundation');
var rd = function (p) { return \$.NSString.stringWithContentsOfFileEncodingError('$PWD/' + p, 4, null).js; };
eval(rd('planning.js'));
eval(rd('tests/planning.test.js'));
var o = runPlanningTests(PlanningCore);
(o.fails.length ? o.fails.join('\n') + '\n' : '') + 'PLANOWANIE: SPRAWDZEŃ ' + o.checks + ', BŁĘDÓW ' + o.fails.length;
")
echo "$res" | sed 's/^/  /'
[[ "$res" == *"BŁĘDÓW 0"* ]] || fail=1

# 5) Style: tylko tokeny marki
./scripts/lint-styles.sh >/dev/null 2>&1 && echo "✔ style      tylko tokeny --lfa-*" || { echo "✘ style      ./scripts/lint-styles.sh zgłasza problemy"; fail=1; }

(( fail )) && { echo "WYNIK: BŁĘDY"; exit 1; } || echo "WYNIK: OK"
