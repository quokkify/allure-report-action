#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${RUNNER_TEMP:-/tmp}/allure-report-action-smoke-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/results"

python3 - "$TMP/results" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
documents = [
    {
        "uuid": "unit-1",
        "name": "labeled unit",
        "status": "passed",
        "stage": "finished",
        "start": 1,
        "stop": 2,
        "labels": [{"name": "epic", "value": "unit"}],
    },
    {
        "uuid": "plain-1",
        "name": "without epic metadata",
        "status": "passed",
        "stage": "finished",
        "start": 1,
        "stop": 2,
    },
]
for document in documents:
    (root / f"{document['uuid']}-result.json").write_text(json.dumps(document))
PY

(
  cd "$TMP"
  npx --yes allure@3.14.2 generate results -o report --config "$ROOT/tests/allurerc.mjs"
  node "$ROOT/allure-ci.mjs" badges --results results --out report
  node "$ROOT/allure-ci.mjs" pr-body \
    --results results \
    --report report \
    --output comment.md \
    --pages-url "https://example.invalid/report" \
    --fork-pr false \
    --source-run-id 123 \
    --comment-marker '<!-- allure-report-action-smoke -->'
  PYRAMID_SOURCE_RUN_ID=123 PYRAMID_HEAD_SHA=0123456789abcdef \
    node "$ROOT/allure-ci.mjs" pyramid \
      --results results \
      --output pyramid.md \
      --json pyramid.json
  node "$ROOT/allure-ci.mjs" pyramid-check \
    --results results \
    --json pyramid-gates.json
)

python3 - "$TMP" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
body = (root / "comment.md").read_text()
assert "**2** tests · **2** passed · 100% pass rate" in body
assert "| Other | 1 | 1 | 0 | 0 | 0 | 100% |" in body
assert body.endswith("<!-- allure-report-action-smoke -->")
assert (root / "report/index.html").is_file()
gates = json.loads((root / "pyramid-gates.json").read_text())
assert gates["metrics"]["otherEpicTotal"] == 1
print("smoke: report, 2 passed, missing Epic -> Other, pyramid outputs OK")
PY
