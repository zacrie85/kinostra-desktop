#!/bin/bash
# generator media uji panjang (hilang bila sandbox daur ulang — jalankan ulang)
# long120 = 2 JAM (120 menit), long240 = 4 JAM (240 menit) — gradients = gerak halus utk pengawas piksel
cd /home/z/my-project
for spec in "120 7200" "240 14400"; do
  set -- $spec
  ffmpeg -y -v error -f lavfi -i "gradients=size=320x180:speed=0.03:rate=8:duration=$2" \
    -f lavfi -i "sine=frequency=440:duration=$2" \
    -c:v libx264 -pix_fmt yuv420p -preset veryfast -crf 42 -c:a aac -b:a 32k -ac 1 -shortest testmedia/long$1.mp4
done
ls -la testmedia/long*.mp4
