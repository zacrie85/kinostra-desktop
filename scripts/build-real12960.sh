#!/bin/bash
# Bangun video uji REALISTIS ala file unduhan user (drama web):
# - 3,6 jam (12960 dtk) — menyaingi video user 12833 dtk
# - 24fps → 311 ribu frame video: tabel stts/stsc/stsz MO-PADAT seperti file nyata
# - moov DI AKHIR file (tanpa +faststart) — khas file hasil unduhan/streaming
# - AAC 44,1 kHz stereo 128k — audio umum (inilah yang dianalisis aplikasi)
# - resolusi kecil 256×144 CRF 36 — ukuran file ±130-190 MB (disk sandbox terbatas);
#   analisis audio TIDAK menyentuh resolusi — yang diuji: struktur wadah + track audio
# Pakai: bash scripts/build-real12960.sh
set -e
cd /home/z/my-project/testmedia
if [ -f real12960.mp4 ] && [ "$(ffprobe -v error -show_entries format=duration -of csv=p=0 real12960.mp4 2>/dev/null | cut -d. -f1)" -ge 12900 ]; then
  echo "real12960.mp4 sudah ada"; exit 0
fi
rm -f real12960.mp4
ffmpeg -y -hide_banner -loglevel error \
  -f lavfi -i "testsrc2=size=256x144:rate=24:duration=12960" \
  -f lavfi -i "sine=frequency=440:sample_rate=44100:duration=12960" \
  -c:v libx264 -preset ultrafast -crf 36 -pix_fmt yuv420p \
  -x264-params "keyint=240:min-keyint=24:scenecut=0:bf=2:refs=2" \
  -c:a aac -b:a 128k -ac 2 \
  real12960.mp4
ffprobe -v error -show_entries format=duration,size -of default=nw=1 real12960.mp4
