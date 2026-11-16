#!/bin/bash
# KINOSTRA v2.16.2 (GARIS KLASIK) — upload 3 aset ke release ID 446496081
set -e
cd /home/z/my-project/classic216
export GH_TOKEN=$(git -C /home/z/my-project remote get-url origin | sed -n 's|https://\([^@]*\)@.*|\1|p')
: "${GH_TOKEN:?token tidak ditemukan di remote}"
REPO="zacrie85/kinostra-desktop"
AUTH="Authorization: token $GH_TOKEN"
RID="446496081"

upload () {
  local f="$1" n="$2" ct="$3"
  echo "== Upload $n =="
  for i in 1 2 3; do
    R=$(curl -s -o /tmp/up2162.json -w "%{http_code}" -X POST \
      -H "$AUTH" -H "Content-Type: $ct" \
      --data-binary @"$f" \
      "https://uploads.github.com/repos/$REPO/releases/$RID/assets?name=$n")
    if [ "$R" = "201" ]; then echo "   OK ($R) $(python3 -c "import json;d=json.load(open('/tmp/up2162.json'));print(round(d['size']/1048576,1),'MB')")"; return 0; fi
    echo "   percobaan $i gagal (HTTP $R): $(head -c 200 /tmp/up2162.json)"; sleep 3
  done
  return 1
}

upload "dist_out/KINOSTRA-Setup-2.16.2.exe" "KINOSTRA-Setup-2.16.2.exe" "application/octet-stream" || exit 1
upload "dist_out/KINOSTRA-Portable-2.16.2-win64.zip" "KINOSTRA-Portable-2.16.2-win64.zip" "application/zip" || exit 1
upload "KINOSTRA-PANDUAN.md" "KINOSTRA-PANDUAN.md" "text/markdown" || exit 1

echo "== Verifikasi aset =="
curl -s -H "$AUTH" "https://api.github.com/repos/$REPO/releases/$RID/assets" \
  | python3 -c "import sys,json; [print(' -', a['name'], round(a['size']/1048576,1), 'MB', a['state']) for a in json.load(sys.stdin)]"

echo "URL: https://github.com/$REPO/releases/tag/v2.16.2"
