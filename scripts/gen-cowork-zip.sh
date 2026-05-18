#!/usr/bin/env bash
# gen-cowork-zip — build a Cowork-ready ZIP for the plugin in this repo
#
# Output : ~/Downloads/<plugin>-v<version>.zip
#
# Cowork (Org Settings → Plugins → Add plugins → Upload a file) attend une ZIP
# au format marketplace mono-plugin :
#   ZIP/.claude-plugin/marketplace.json   (source: "./<plugin>")
#   ZIP/<plugin>/.claude-plugin/plugin.json
#   ZIP/<plugin>/skills/, commands/, etc.
#
# Le repo GitHub lui utilise source: "./" (plugin au root du repo). Le ZIP
# inverse la convention parce que Cowork upload veut le pattern subfolder.
# Le owner du marketplace embedded est lu depuis plugin.json (author.name /
# author.url) — le script marche pour n'importe quel plugin sans modif.

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

python3 - "$BUILD" "$PLUGIN_JSON" "$PLUGIN" "$VERSION" <<'PY'
import json, sys
build, plugin_json_path, plugin, version = sys.argv[1:5]
pj = json.load(open(plugin_json_path))
author = pj.get("author", {}) or {}
description = pj.get("description", f"Cowork upload bundle for {plugin}.")
owner = {"name": author.get("name", "Unknown")}
if author.get("url"):
    owner["url"] = author["url"]
manifest = {
    "$schema": "https://anthropic.com/claude-code/marketplace.schema.json",
    "name": f"{plugin}-cowork",
    "description": f"Cowork upload bundle for {plugin}.",
    "owner": owner,
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
