#!/bin/bash
# KINOSTRA v3.34.0 — build Setup + Portable (jalur manual terbukti sejak v3.13)
# 1) electron-builder --win dir (afterpack: ikon + versi 3.34.0.0)
# 2) makensis manual NSISDIR ke ROOT nsis (bukan linux) → Setup
# 3) zip win-unpacked → Portable
# 4) verifikasi versi UTF-16 di Setup & KINOSTRA.exe portable
set -e
cd /home/z/my-project
NSISROOT=/home/z/.cache/electron-builder/nsis/nsis-3.0.4.1
NSIS="$NSISROOT/linux/makensis"

echo "== 1. electron-builder --win dir =="
npx electron-builder --win --dir 2>&1 | tail -3

echo "== 2. makensis (Setup) =="
if [ ! -x "$NSIS" ]; then
  echo "NSIS cache hilang — pulihkan via --win nsis (konflik VIProductVersion = protokol normal)"
  npx electron-builder --win nsis 2>&1 | tail -3 || true
fi
NSISDIR="$NSISROOT" "$NSIS" build/installer.nsi | tail -4

echo "== 3. Portable zip =="
rm -f dist_out/KINOSTRA-Portable-3.34.0-win64.zip
( cd dist_out && zip -qr KINOSTRA-Portable-3.34.0-win64.zip win-unpacked )

echo "== 4. Verifikasi versi UTF-16 & isi paket =="
for f in dist_out/KINOSTRA-Setup-3.34.0.exe dist_out/win-unpacked/KINOSTRA.exe; do
  echo "-- $f"; strings -el "$f" | grep -o "3\.33\.0\.0" | head -2
done
echo "-- resources/app identik sumber (asar=false: app = folder biasa)"
diff -q dist_out/win-unpacked/resources/app/renderer/index.html renderer/index.html && diff -q dist_out/win-unpacked/resources/app/renderer/css/kinestra.css renderer/css/kinestra.css
echo "-- isi portable zip"
unzip -p dist_out/KINOSTRA-Portable-3.34.0-win64.zip win-unpacked/resources/app/renderer/index.html | grep -c "chips names"
unzip -p dist_out/KINOSTRA-Portable-3.34.0-win64.zip win-unpacked/resources/app/renderer/index.html | grep -c "v3\.33\.0"
echo "== 5. Hasil =="
ls -la dist_out/KINOSTRA-Setup-3.34.0.exe dist_out/KINOSTRA-Portable-3.34.0-win64.zip
