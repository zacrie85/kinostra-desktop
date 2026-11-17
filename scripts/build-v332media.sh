#!/bin/bash
# Regenerasi media uji v3.32.0 (film utuh 66 menit) — pakai:
#   bash scripts/build-v332media.sh
set -e
cd /home/z/my-project/testmedia

if [ ! -f longsilent66m.mp4 ] || [ "$(ffprobe -v error -show_entries format=duration -of csv=p=0 longsilent66m.mp4)" \< 3900 ]; then
  echo "== longsilent66m.mp4 (66 mnt, audio hening stereo) =="
  ffmpeg -y -v error -f lavfi -i "color=c=black:s=256x144:r=8" \
    -f lavfi -i "anullsrc=r=48000:cl=stereo" -t 3960 \
    -c:v libx264 -preset ultrafast -crf 40 -c:a aac -b:a 64k longsilent66m.mp4
fi

if [ ! -f longtone66m.mp4 ] || [ "$(ffprobe -v error -show_entries format=duration -of csv=p=0 longtone66m.mp4)" \< 3900 ]; then
  echo "== longtone66m.mp4 (66 mnt, nada 440 Hz −16 dB stereo) =="
  ffmpeg -y -v error -f lavfi -i "color=c=black:s=192:108:r=6" \
    -f lavfi -i "sine=frequency=440:sample_rate=48000" -af "volume=0.158" -t 3960 -ac 2 \
    -c:v libx264 -preset ultrafast -crf 47 -c:a aac -b:a 64k longtone66m.mp4
fi

for f in longsilent66m.mp4 longtone66m.mp4; do
  echo "$f: $(ffprobe -v error -show_entries format=duration -of csv=p=0 $f) dtk · kanal audio: $(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of csv=p=0 $f)"
done
echo "SELESAI"
