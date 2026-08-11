#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C
export TZ=UTC

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANIFEST_VERSION="$(node -e 'const fs = require("node:fs"); const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(manifest.version);' "$ROOT_DIR/manifest.json")"
VERSION="${1:-$MANIFEST_VERSION}"

if [[ "$VERSION" != "$MANIFEST_VERSION" ]]; then
  echo "Version mismatch: requested $VERSION but manifest.json contains $MANIFEST_VERSION" >&2
  exit 1
fi

DIST_DIR="$ROOT_DIR/dist"
ASSET_NAME="mathscinet-bibtex-exporter-v${VERSION}.zip"
ASSET_PATH="$DIST_DIR/$ASSET_NAME"
CHECKSUM_PATH="$ASSET_PATH.sha256"
PACKAGE_FILES=(
  manifest.json
  i18n.js
  lib.js
  content.js
  popup.html
  popup.css
  popup.js
  _locales/en/messages.json
  _locales/zh_CN/messages.json
  icons/icon-16.png
  icons/icon-32.png
  icons/icon-48.png
  icons/icon-128.png
  README.md
  LICENSE
  CHANGELOG.md
)
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/msbe-package.XXXXXX")"
trap 'rm -rf "$STAGING_DIR"' EXIT

mkdir -p "$DIST_DIR"
rm -f "$ASSET_PATH" "$CHECKSUM_PATH"
for file in "${PACKAGE_FILES[@]}"; do
  mkdir -p "$STAGING_DIR/$(dirname "$file")"
  cp "$ROOT_DIR/$file" "$STAGING_DIR/$file"
done
find "$STAGING_DIR" -type f -exec chmod 0644 {} +
find "$STAGING_DIR" -type f -exec touch -t 202001010000 {} +

(
  cd "$STAGING_DIR"
  find . -type f -print | LC_ALL=C sort | sed 's#^\./##' | zip -X -q "$ASSET_PATH" -@
)
(
  cd "$DIST_DIR"
  shasum -a 256 "$ASSET_NAME" > "$ASSET_NAME.sha256"
)

echo "Created $ASSET_PATH"
echo "Created $CHECKSUM_PATH"
