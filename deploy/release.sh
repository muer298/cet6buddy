#!/usr/bin/env bash
set -euo pipefail

APP_ROOT=/opt/cet6-buddy
RELEASE_ID="$(date -u +%Y%m%d%H%M%S)"
RELEASE_DIR="$APP_ROOT/releases/$RELEASE_ID"

mkdir -p "$RELEASE_DIR"
cp -R dist package.json package-lock.json "$RELEASE_DIR/"
cd "$RELEASE_DIR"
npm ci --omit=dev --ignore-scripts
node --env-file=/etc/cet6-buddy/production.env dist/server/index.js --check-config
ln -sfn "$RELEASE_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
systemctl restart cet6-buddy
curl --fail --silent --show-error https://example.com/health
find "$APP_ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -nr | tail -n +6 | cut -d' ' -f2- | xargs -r rm -rf
