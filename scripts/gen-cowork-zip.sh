#!/usr/bin/env bash
# gen-cowork-zip — build a Cowork-ready ZIP for this plugin
#
# Output : ~/Downloads/driven-v<version>.zip
#
# Cowork (Org Settings → Plugins → Add plugins → Upload a file) attend une ZIP
# au format marketplace mono-plugin :
#   ZIP/.claude-plugin/marketplace.json   (source: "./driven")
#   ZIP/driven/.claude-plugin/plugin.json
#   ZIP/driven/skills/, commands/, etc.
#
# Le repo GitHub lui utilise source: "./" (plugin au root du repo). Le ZIP a
# une structure légèrement différente parce que Cowork upload veut le pattern
# subfolder. Le script gère la conversion automatiquement.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLUGIN_JSON="$REPO_ROOT/.claude-plugin/plugin.json"
[[ -f "$PLUGIN_JSON" ]] || { echo "plugin.json not found at $PLUGIN_JSON" >&2; exit 1; }

PLUGIN="$(python3 -c "import json; print(json.load(open('$PLUGIN_JSON'))['name'])")"
VERSION="$(python3 -c "import json; print(json.load(open('$PLUGIN_JSON'))['version'])")"

echo "Plugin   : $PLUGIN"
echo "Version  : $VERSION"

if [[ "$VERSION" == *"-"* ]]; then
  echo "⚠ version '$VERSION' contains a pre-release tag. Cowork may reject." >&2
fi

if command -v claude >/dev/null 2>&1; then
  claude plugin validate "$REPO_ROOT" || { echo "✗ Manifest validation failed" >&2; exit 1; }
fi

BUILD="$(mktemp -d -t cowork-zip-XXXXXX)"
trap 'rm -rf "$BUILD"' EXIT
mkdir -p "$BUILD/.claude-plugin"
mkdir -p "$BUILD/$PLUGIN"

rsync -a \
  --exclude='.git' \
  --exclude='.DS_Store' \
  --exclude='__MACOSX' \
  --exclude='__pycache__' \
  --exclude='*.pyc' \
  --exclude='node_modules' \
  --exclude='.venv' \
  --exclude='.claude-plugin/marketplace.json' \
  "$REPO_ROOT/" "$BUILD/$PLUGIN/"

DESCRIPTION="$(python3 -c "import json; print(json.load(open('$PLUGIN_JSON')).get('description',''))")"
python3 - "$BUILD" "$PLUGIN" "$VERSION" "$DESCRIPTION" <<'PY'
import json, sys
build, plugin, version, description = sys.argv[1:5]
manifest = {
    "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
    "name": f"{plugin}-cowork",
    "description": f"Cowork upload bundle for {plugin}.",
    "owner": {"name": "Drivenlabs", "url": "https://drivenlabs.ai"},
    "plugins": [{
        "name": plugin,
        "description": description,
        "version": version,
        "source": f"./{plugin}",
    }],
}
with open(f"{build}/.claude-plugin/marketplace.json", "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
PY

OUT="$HOME/Downloads/${PLUGIN}-v${VERSION}.zip"
rm -f "$OUT"
(cd "$BUILD" && zip -rq "$OUT" . -x "*.DS_Store" -x "__MACOSX/*")
unzip -tq "$OUT" >/dev/null

echo "✓ $OUT ($(ls -lh "$OUT" | awk '{print $5}'))"
