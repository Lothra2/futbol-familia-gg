#!/bin/bash
# Builds the game and zips it with the launchers: tools/pack.sh [output.zip]
set -e
cd "$(dirname "$0")/.."
OUT="$(realpath -m "${1:-futbol-familia-gg.zip}")"
npx vite build >/dev/null
rm -rf /tmp/futbol-pack && mkdir -p /tmp/futbol-pack/futbol
cp -r dist/. /tmp/futbol-pack/futbol/
cp tools/launchers/jugar.bat tools/launchers/jugar.command tools/launchers/LEEME.txt /tmp/futbol-pack/futbol/
chmod +x /tmp/futbol-pack/futbol/jugar.command
rm -f "$OUT"; (cd /tmp/futbol-pack && zip -qr "$OUT" futbol)
echo "listo: $OUT ($(du -h "$OUT" | cut -f1))"
