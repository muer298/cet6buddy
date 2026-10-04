#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/opt/cet6-buddy
CURRENT="$(readlink -f "$APP_ROOT/current")"
PREVIOUS="$(find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d ! -path "$CURRENT" -printf '%T@ %p\n' | sort -nr | head -n 1 | cut -d' ' -f2-)"
test -n "$PREVIOUS"
ln -sfn "$PREVIOUS" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
systemctl restart cet6-buddy
