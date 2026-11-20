#!/bin/bash
# RONDE 2 regresi v3.35.0 — 4 suite yang asersinya dipatch sadar-v3.35
cd /home/z/my-project
LOG=testmedia/hasil-regressi-v335-r2.txt
: > "$LOG"
run () {
  local nama="$1" skrip="$2" to="$3"
  echo "==================================================" | tee -a "$LOG"
  echo "SUITE: $nama ($skrip)" | tee -a "$LOG"
  bash scripts/run-test-xvfb.sh "$skrip" "$to" 2>&1 | grep -E "LULUS|GAGAL|SELESAI|RC=|HASIL|ERROR|ERR_" | tee -a "$LOG"
}
run "v334"   scripts/kinostra-v334-test.mjs 420
run "v333"   scripts/kinostra-v333-test.mjs 420
run "v328"   scripts/kinostra-v328-test.mjs 600
run "ekspor" scripts/kinostra-v216-export.mjs 420
echo "===== RONDE 2 SELESAI =====" | tee -a "$LOG"
