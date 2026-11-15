#!/bin/bash
# KINOSTRA v3.17.1 — bangun Setup + Portable dari win-unpacked yang ada
set -e
cd /home/z/my-project
MAKENSIS=/home/z/.cache/electron-builder/nsis/nsis-3.0.4.1/linux/makensis

echo "== 1. Suntik versi 3.17.1 ke win-unpacked/KINOSTRA.exe (afterpack manual) =="
node -e "
const hp = require('/home/z/my-project/build/afterpack.js');
hp.default({
  appOutDir: '/home/z/my-project/dist_out/win-unpacked',
  electronPlatformName: 'win32',
  packager: { appInfo: { productFilename: 'KINOSTRA' } }
}).then(() => console.log('[build] afterpack manual selesai'));
"

echo "== 2. makensis (Setup) =="
NSISDIR=/home/z/.cache/electron-builder/nsis/nsis-3.0.4.1 "$MAKENSIS" build/installer.nsi | tail -4

echo "== 3. Portable zip =="
cd dist_out
rm -f KINOSTRA-Portable-3.17.1-win64.zip
cd win-unpacked && zip -qr ../KINOSTRA-Portable-3.17.1-win64.zip . && cd ..
echo "== 4. Hasil =="
ls -la KINOSTRA-Setup-3.17.1.exe KINOSTRA-Portable-3.17.1-win64.zip
