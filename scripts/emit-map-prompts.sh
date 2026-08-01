#!/usr/bin/env bash
# Emit Map prompts for every batch in a shard run directory.
set -euo pipefail
RUN_DIR=${1:?usage: emit-map-prompts.sh <run-dir>}
MANIFEST="$RUN_DIR/shard-manifest.json"
OUT="$RUN_DIR/prompts"
mkdir -p "$OUT"
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CLI="$ROOT/dist/cli.js"
if [[ ! -f "$CLI" ]]; then
  (cd "$ROOT" && npm run build)
fi
batches=$(node --input-type=module -e "import m from 'file://$PWD/$MANIFEST' with {type:'json'}; process.stdout.write(m.batches.map(b=>b.id).join('\n'))")
while IFS= read -r batch; do
  [[ -z "$batch" ]] && continue
  node "$CLI" prompt map --manifest "$MANIFEST" --batch "$batch" > "$OUT/$batch.md"
  echo "wrote $OUT/$batch.md"
done <<< "$batches"
