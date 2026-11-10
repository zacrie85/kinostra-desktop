#!/bin/bash
# Download vendor libraries for offline use
set -e
V=/home/z/my-project/kinostra-desktop/renderer/vendor
mkdir -p "$V"
cd "$V"

echo "[1/3] lucide icons..."
curl -sL --retry 3 -o lucide.min.js "https://unpkg.com/lucide@0.462.0/dist/umd/lucide.min.js"

echo "[2/3] mp4-muxer..."
curl -sL --retry 3 -o mp4-muxer.min.js "https://cdn.jsdelivr.net/npm/mp4-muxer@5.1.5/dist/mp4-muxer.min.js"

echo "[3/3] transformers.js UMD..."
curl -sL --retry 3 -o transformers.min.js "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/dist/transformers.min.js"

ls -la
echo "---- global names check ----"
grep -o "Mp4Muxer" mp4-muxer.min.js | head -1
grep -o "window.transformers\|globalThis.transformers" transformers.min.js | head -1
grep -o "lucide" lucide.min.js | head -1
