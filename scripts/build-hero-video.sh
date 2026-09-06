#!/bin/bash
# Genera los loops del hero de la tienda (public/media/hero/*) a partir de clips de Pexels.
#
# Uso (Git Bash, con ffmpeg en el PATH):
#   bash scripts/build-hero-video.sh media/source/video
#
# El directorio de entrada debe contener los clips originales descargados desde
# https://www.pexels.com/download/video/<id>/ con el nombre <id>.mp4 (no se versionan, pesan ~130 MB):
#
#   37714300.mp4  Palitos de queso estirándose (Icha Ghozali)          1080x1920  9 s
#   34556299.mp4  Hamburguesas con queso derritiéndose (Caleb Oquendo)  1920x1080 16 s
#   31176159.mp4  Carne a la parrilla con llamas (Bon appétit)          1080x1920 23 s
#   35517101.mp4  Bolitas de mozzarella estirándose, fondo negro        2160x3840 34 s
#
# Licencia Pexels: uso comercial permitido, sin atribución obligatoria.
# https://www.pexels.com/license/
#
# Salida: un único loop H.264 sin audio, 30 fps, faststart. Horizontal 1280x720 para escritorio y
# vertical 720x1280 para móvil. Presupuesto: <3.1 MB horizontal, <2.4 MB vertical.
set -euo pipefail

SRC="${1:-media/source/video}"
OUT="public/media/hero"
FF="${FFMPEG:-ffmpeg}"
XF=0.6  # segundos de fundido entre clips

mkdir -p "$OUT"

# seg <índice de entrada> <inicio> <duración> <cropW:cropH:x:y> <anchoxalto de salida>
seg() {
  echo "[$1:v]trim=start=$2:duration=$3,setpts=PTS-STARTPTS,crop=$4,scale=$5:flags=lanczos,fps=30,format=yuv420p,settb=AVTB[v$1];"
}

# Encadena 4 segmentos (5 + 4.5 + 5 + 5 s) con fundidos y abre/cierra a negro para que el loop no salte.
chain() {
  echo "[v0][v1]xfade=transition=fade:duration=$XF:offset=4.4[x1];"
  echo "[x1][v2]xfade=transition=fade:duration=$XF:offset=8.3[x2];"
  echo "[x2][v3]xfade=transition=fade:duration=$XF:offset=12.7[x3];"
  echo "[x3]fade=t=in:st=0:d=0.5,fade=t=out:st=17.2:d=0.5[out]"
}

encode() {
  # encode <salida> <crf> <filtro>
  "$FF" -v error -y \
    -i "$SRC/37714300.mp4" -i "$SRC/34556299.mp4" -i "$SRC/31176159.mp4" -i "$SRC/35517101.mp4" \
    -filter_complex "$3" -map "[out]" -an \
    -c:v libx264 -preset slow -crf "$2" -profile:v high -level 4.0 -pix_fmt yuv420p \
    -movflags +faststart -g 60 "$1"
}

# ---------- Hero: horizontal ----------
FILTER="$(seg 0 1.0 5.0 1080:608:0:420 1280:720)$(seg 1 1.5 4.5 1920:1080:0:0 1280:720)$(seg 2 3.5 5.0 1080:608:0:1000 1280:720)$(seg 3 13.0 5.0 2160:1215:0:1050 1280:720)$(chain)"
encode "$OUT/hero-landscape.mp4" 27 "$FILTER"

# ---------- Hero: vertical ----------
FILTER="$(seg 0 1.0 5.0 1080:1920:0:0 720:1280)$(seg 1 1.5 4.5 608:1080:656:0 720:1280)$(seg 2 3.5 5.0 1080:1920:0:0 720:1280)$(seg 3 13.0 5.0 2160:3840:0:0 720:1280)$(chain)"
encode "$OUT/hero-portrait.mp4" 28 "$FILTER"

# ---------- Pósters (primer fotograma visible mientras carga el video) ----------
"$FF" -v error -y -ss 2.4 -i "$OUT/hero-landscape.mp4" -frames:v 1 -c:v libwebp -quality 74 "$OUT/hero-landscape.webp"
"$FF" -v error -y -ss 2.4 -i "$OUT/hero-portrait.mp4"  -frames:v 1 -c:v libwebp -quality 74 "$OUT/hero-portrait.webp"

ls -la "$OUT"
