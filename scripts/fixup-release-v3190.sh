#!/bin/bash
# Perbaikan rilis v3.19.0: hapus aset 3.18.0 yang salah unggah, unggah aset 3.19.0 yang benar
set -e
cd /home/z/my-project
export GH_TOKEN=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"

RID=$(curl -s -H "$AUTH" https://api.github.com/repos/$REPO/releases/tags/v3.19.0 \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "Release ID v3.19.0: $RID"

echo "== Hapus aset salah (3.18.0) =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" | python3 -c "
import sys, json
for a in json.load(sys.stdin):
    if '3.18.0' in a['name']:
        print('hapus', a['id'], a['name'])
        import urllib.request
        req = urllib.request.Request('https://api.github.com/repos/$REPO/releases/assets/%d' % a['id'], method='DELETE', headers={'Authorization': 'token $GH_TOKEN'})
        urllib.request.urlopen(req)
" || true

upload () {
  local f="$1" n="$2" ct="$3"
  echo "== Upload $n =="
  for i in 1 2 3; do
    R=$(curl -s -o /tmp/up.json -w "%{http_code}" -X POST \
      -H "$AUTH" -H "Content-Type: $ct" \
      --data-binary @"$f" \
      "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$n")
    if [ "$R" = "201" ]; then echo "   OK ($R)"; return 0; fi
    echo "   percobaan $i gagal (HTTP $R): $(head -c 200 /tmp/up.json)"; sleep 3
  done
  return 1
}

upload "dist_out/KINOSTRA-Setup-3.19.0.exe" "KINOSTRA-Setup-3.19.0.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-3.19.0-win64.zip" "KINOSTRA-Portable-3.19.0-win64.zip" "application/zip" || exit 1

echo "== Verifikasi akhir =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"
