#!/bin/bash
# REGRESI v3.35.0 — 12 suite lama dijalankan berurutan (pola v3.34)
# catat ke testmedia/hasil-regressi-v335.txt
cd /home/z/my-project
LOG=testmedia/hasil-regressi-v335.txt
: > "$LOG"
run () {
  local nama="$1" skrip="$2" to="$3"
  echo "==================================================" | tee -a "$LOG"
  echo "SUITE: $nama ($skrip)" | tee -a "$LOG"
  bash scripts/run-test-xvfb.sh "$skrip" "$to" 2>&1 | grep -E "LULUS|GAGAL|SELESAI|RC=|ERROR" | tee -a "$LOG"
}
run "v334"    scripts/kinostra-v334-test.mjs 420
run "v333"    scripts/kinostra-v333-test.mjs 420
run "v331"    scripts/kinostra-v331-test.mjs 480
run "v330"    scripts/kinostra-v330-test.mjs 600
run "v329"    scripts/kinostra-v329-test.mjs 600
run "modul16" scripts/kinostra-maintenance-test.mjs 420
run "ekspor"  scripts/kinostra-v216-export.mjs 420
run "v328"    scripts/kinostra-v328-test.mjs 600
run "v327"    scripts/kinostra-v327-test.mjs 600
run "v314"    scripts/kinostra-v314-test.mjs 600
run "frame"   scripts/kinostra-v323-frame-test.mjs 420
run "overlay" scripts/kinostra-v325-overlay-test.mjs 420
echo "===== REGRESI SELESAI =====" | tee -a "$LOG"
