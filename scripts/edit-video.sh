#!/usr/bin/env bash
# Edits the captured REAL gameplay frames (scripts/capture-video.mjs) into 15s / 30s 1080x1920 MP4s.
# Telops are calm and factual (no sensational captions); audio is synthesized ambience/rumble
# (no sirens, no alert tones).
set -euo pipefail
cd "$(dirname "$0")/.."
FONT=${FONT:-/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf}
F=media/frames
T=media/tmp
mkdir -p "$T" media

# --- 1. encode each captured segment (30 fps, 1080x1920)
for s in street quake sea run hill; do
  ffmpeg -y -v error -framerate 30 -i "$F/$s/%04d.jpg" -vf "scale=1080:1920:flags=lanczos" -c:v libx264 -crf 14 -preset medium -pix_fmt yuv420p "$T/$s.mp4"
done

printf '%s' '実際のゲームプレイ画面（自動操作・架空の町）' > "$T/caption.txt"

audio() { # $1 kind, $2 duration
  case "$1" in
    town)  echo "anoisesrc=d=$2:c=pink:a=0.05:r=48000,lowpass=f=900" ;;
    quake) echo "anoisesrc=d=$2:c=brown:a=0.6:r=48000,lowpass=f=110,volume=2.0" ;;
    sea)   echo "anoisesrc=d=$2:c=pink:a=0.12:r=48000,lowpass=f=450,volume='0.55+0.45*sin(2*PI*t/4.5)':eval=frame" ;;
    run)   echo "anoisesrc=d=$2:c=pink:a=0.05:r=48000,lowpass=f=700" ;;
    hill)  echo "anoisesrc=d=$2:c=pink:a=0.06:r=48000,lowpass=f=300" ;;
  esac
}

# clip <segment> <start> <duration> <telop> <audio-kind> <out-name>
clip() {
  local seg=$1 ss=$2 d=$3 txt=$4 kind=$5 out=$6
  printf '%s' "$txt" > "$T/$out.txt"
  local fo; fo=$(python3 -c "print($d-0.45)")
  local vo; vo=$(python3 -c "print($d-0.2)")
  ffmpeg -y -v error -ss "$ss" -t "$d" -i "$T/$seg.mp4" -f lavfi -i "$(audio "$kind" "$d")" -filter_complex \
    "[0:v]drawtext=fontfile=$FONT:textfile=$T/$out.txt:fontsize=56:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=26:x=(w-text_w)/2:y=h*0.60:alpha='if(lt(t,0.35),t/0.35,if(gt(t,$fo),max(0,($d-t)/0.45),1))',\
drawtext=fontfile=$FONT:textfile=$T/caption.txt:fontsize=26:fontcolor=white@0.9:box=1:boxcolor=black@0.45:boxborderw=10:x=(w-text_w)/2:y=h*0.885,\
fade=t=in:st=0:d=0.15,fade=t=out:st=$vo:d=0.2,fps=30,format=yuv420p[v];\
[1:a]afade=t=in:d=0.15,afade=t=out:st=$vo:d=0.2[a]" \
    -map "[v]" -map "[a]" -t "$d" -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 128k -ar 48000 "$T/$out.mp4"
}

# endcard <duration> <out-name>
endcard() {
  local d=$1 out=$2
  printf '%s' '14:46 — 高台へ' > "$T/e1.txt"
  printf '%s' '海が静かでも、避難を。' > "$T/e2.txt"
  printf '%s' '東日本大震災の教訓をもとにした防災体験ゲーム（試作版）' > "$T/e3.txt"
  printf '%s' '※舞台・人物は架空です。津波の表現は演出用の簡易モデルです。' > "$T/e4.txt"
  printf '%s' '実際の避難は、自治体のハザードマップや公的な情報に従ってください。' > "$T/e5.txt"
  ffmpeg -y -v error -f lavfi -i "color=c=0x13202a:s=1080x1920:d=$d:r=30" -f lavfi -i "anullsrc=r=48000:cl=stereo" -filter_complex \
    "[0:v]drawtext=fontfile=$FONT:textfile=$T/e1.txt:fontsize=100:fontcolor=white:x=(w-text_w)/2:y=h*0.36,\
drawtext=fontfile=$FONT:textfile=$T/e2.txt:fontsize=56:fontcolor=0xcfe3d6:x=(w-text_w)/2:y=h*0.47,\
drawtext=fontfile=$FONT:textfile=$T/e3.txt:fontsize=32:fontcolor=white@0.9:x=(w-text_w)/2:y=h*0.58,\
drawtext=fontfile=$FONT:textfile=$T/e4.txt:fontsize=28:fontcolor=0xe7c46a:x=(w-text_w)/2:y=h*0.64,\
drawtext=fontfile=$FONT:textfile=$T/e5.txt:fontsize=27:fontcolor=0xe7c46a:x=(w-text_w)/2:y=h*0.67,\
fade=t=in:st=0:d=0.3,format=yuv420p[v]" \
    -map "[v]" -map 1:a -t "$d" -c:v libx264 -crf 17 -preset medium -c:a aac -b:a 128k -ar 48000 "$T/$out.mp4"
}

concat() { # <output> <clips...>
  local outp=$1; shift
  : > "$T/list.txt"
  for c in "$@"; do echo "file '$PWD/$T/$c.mp4'" >> "$T/list.txt"; done
  ffmpeg -y -v error -f concat -safe 0 -i "$T/list.txt" -c:v libx264 -crf 19 -preset slow -profile:v high -level 4.1 -pix_fmt yuv420p -r 30 \
    -c:a aac -b:a 128k -ar 48000 -movflags +faststart "$outp"
}

# --- 30 s cut
clip street 0    4.0 '架空の沿岸の町「潮凪町」'          town  a1
clip quake  2.5  5.5 '強い揺れ、長い揺れを感じたら'       quake a2
clip sea    0.5  4.5 '海が静かに見えても'                 sea   a3
clip run    0.5  8.5 'すぐに、高い場所へ。'               run   a4
clip hill   0.5  5.0 '津波は、見えてからでは間に合わない。' hill  a5
endcard 2.5 a6
concat media/takadai_30s_1080x1920.mp4 a1 a2 a3 a4 a5 a6

# --- 15 s cut
clip quake  2.8  4.2 '強い揺れを感じたら'           quake b1
clip sea    1.0  3.3 '海が静かでも、'               sea   b2
clip run    2.0  4.0 'すぐ高台へ。'                 run   b3
clip hill   1.5  2.0 '見てからでは、間に合わない。' hill  b4
endcard 1.5 b5
concat media/takadai_15s_1080x1920.mp4 b1 b2 b3 b4 b5

for f in media/takadai_15s_1080x1920.mp4 media/takadai_30s_1080x1920.mp4; do
  ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration -of compact "$f"
done
