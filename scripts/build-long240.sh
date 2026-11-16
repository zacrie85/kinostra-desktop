#!/bin/bash
# Bangun video uji 4 jam (long240.mp4) dari base30.mp4 × 480 — stream copy
# (persis metode long120 = base30×240). Pakai: bash scripts/build-long240.sh
set -e
cd /home/z/my-project/testmedia
if [ -f long240.mp4 ] && [ "$(ffprobe -v error -show_entries format=duration -of csv=p=0 long240.mp4)" \> 14300 ]; then
  echo "long240.mp4 sudah ada"; exit 0
fi
python3 - <<'EOF'
with open('/tmp/concat240.txt', 'w') as f:
    for _ in range(480):
        f.write("file '/home/z/my-project/testmedia/base30.mp4'\n")
EOF
ffmpeg -y -f concat -safe 0 -i /tmp/concat240.txt -c copy long240.mp4 2>&1 | tail -2
ffprobe -v error -show_entries format=duration,size -of default=nw=1 long240.mp4
