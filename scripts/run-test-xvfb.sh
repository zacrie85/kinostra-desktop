#!/bin/bash
# runner uji KINOSTRA: Xvfb hidup dalam sesi yang sama dgn node test
# pakai: bash scripts/run-test-xvfb.sh <test.mjs> [timeout_s]
set -u
T="$1"
TO="${2:-580}"
pkill -f "Xvfb :99" 2>/dev/null
rm -f /tmp/.X11-unix/X99
Xvfb :99 -screen 0 1600x900x24 > /tmp/xvfb.log 2>&1 &
XPID=$!
for i in $(seq 1 20); do [ -S /tmp/.X11-unix/X99 ] && break; sleep 0.3; done
cd /home/z/my-project
DISPLAY=:99 timeout "$TO" node "$T"
RC=$?
kill "$XPID" 2>/dev/null
wait "$XPID" 2>/dev/null
echo "RC=$RC"
