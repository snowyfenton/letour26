#!/usr/bin/env bash
# Download official stage profile + map images from letour.fr (ASO CDN).
# Run once at build time; images are committed into site/img/.
set -uo pipefail
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
OUT="$(dirname "$0")/../site/img"
mkdir -p "$OUT"

for n in $(seq 1 21); do
  nn=$(printf "%02d" "$n")
  html=$(curl -s -A "$UA" "https://www.letour.fr/en/stage-$n")
  profile=$(grep -oE 'https://img\.aso\.fr/[^"'"'"' \\<>]+' <<<"$html" | grep -i 'profils-web' | head -1)
  map=$(grep -oE 'https://img\.aso\.fr/[^"'"'"' \\<>]+' <<<"$html" | grep -iE 'carte' | head -1)
  if [ -n "$profile" ]; then
    curl -s -A "$UA" -o "$OUT/stage-$nn-profile.jpg" "$profile" && echo "stage $nn profile OK"
  else
    echo "stage $nn profile MISSING"
  fi
  if [ -n "$map" ]; then
    curl -s -A "$UA" -o "$OUT/stage-$nn-map.jpg" "$map" && echo "stage $nn map OK"
  else
    echo "stage $nn map MISSING"
  fi
  sleep 1
done
