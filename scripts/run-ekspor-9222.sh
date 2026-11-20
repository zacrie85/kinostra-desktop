#!/bin/bash
# Pembungkus suite ekspor (v216-export): nyalakan aplikasi dulu di port 9222
# (skrip suite lama TIDAK menyalakan aplikasi sendiri), lalu jalankan, lalu matikan.
set -u
cd /home/z/my-project
pkill -f "Xvfb :99" 2>/dev/null; rm -f /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1600x900x24 > /tmp/xvfb.log 2>&1 &
XPID=$!
for i in $(seq 1 20); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.3; done

export DISPLAY=:99
node_modules/electron/dist/electron . --remote-debugging-port=9222 --no-sandbox > /tmp/app9222.log 2>&1 &
APPID=$!
UP=0
for i in $(seq 1 60); do
  if curl -s http://127.0.0.1:9222/json | grep -q index.html; then UP=1; break; fi
  sleep 1
done
if [ "$UP" != "1" ]; then echo "XX aplikasi tak hidup di 9222"; kill $APPID $XPID 2>/dev/null; exit 2; fi
sleep 2
timeout 360 node scripts/kinostra-v216-export.mjs
RC=$?
kill $APPID $XPID 2>/dev/null
wait $APPID $XPID 2>/dev/null
echo "RC=$RC"
