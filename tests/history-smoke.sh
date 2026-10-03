#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${RUNNER_TEMP:-/tmp}/allure-report-action-history-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ALLURE_VERSION="$(awk '/^  allure-version:/ {found=1} found && /default:/ {gsub(/"/, "", $2); print $2; exit}' "$ROOT/action.yml")"
[[ "$ALLURE_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "cannot read allure-version default" >&2; exit 1; }

run_report() {
  local label="$1" spec="$2"
  rm -rf "$TMP/source-results"
  python3 - "$TMP/source-results" "$spec" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
for index, entry in enumerate(sys.argv[2].split(","), 1):
    module, name, status = entry.split(":")
    directory = root / module / "allure-results"
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "ci-env-fragment.properties").write_text(f"{module}.Module={module}\n")
    document = {
        "uuid": f"{module}-{name}-{index}",
        "name": name,
        "fullName": f"example.HistoryTest#{name}",
        "status": status,
        "stage": "finished",
        "start": 1000 + index,
        "stop": 2000 + index,
        "labels": [{"name": "suite", "value": "HistoryTest"}, {"name": "module", "value": module}],
    }
    (directory / f"{document['uuid']}-result.json").write_text(json.dumps(document))
PY
  (
    cd "$TMP"
    node "$ROOT/dist/cli.cjs" prepare-results --source-root source-results --results results --module-label module
    node "$ROOT/dist/cli.cjs" module-config --results results --config "$ROOT/tests/history-allurerc.mjs" \
      --output config/effective-allurerc.mjs --module-label module
    rm -rf report
    npx --yes "allure@$ALLURE_VERSION" generate results -o report --config config/effective-allurerc.mjs
  ) > "$TMP/$label.log" 2>&1 || { cat "$TMP/$label.log"; exit 1; }
  python3 - "$TMP" "$label" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
tests = {}
for path in (root / "report/data/test-results").glob("*.json"):
    document = json.loads(path.read_text())
    tests[document["id"]] = (f"{document['environment']}/{document['name']}", document.get("transition"))
summary = json.loads((root / "report/summary.json").read_text())
state = {
    "transitions": dict(sorted(tests.values())),
    "new": sorted(tests[identifier][0] for identifier in summary["newTests"]),
    "history": len((root / "history/history.jsonl").read_text().splitlines()),
}
(root / f"{sys.argv[2]}.json").write_text(json.dumps(state))
PY
}

run_report a "module-a:alpha:passed,module-b:alpha:passed"
run_report b "module-a:alpha:passed,module-b:alpha:passed,module-a:beta:passed"
run_report c "module-a:alpha:failed,module-b:alpha:passed,module-a:beta:passed"
run_report d "module-a:alpha:passed,module-b:alpha:passed,module-a:beta:passed"

python3 - "$TMP" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
a, b, c, d = (json.loads((root / f"{label}.json").read_text()) for label in "abcd")

assert a["new"] == ["module-a/alpha", "module-b/alpha"], a
assert a["transitions"] == {"module-a/alpha": "new", "module-b/alpha": "new"}, a
assert b["new"] == ["module-a/beta"], b
assert b["transitions"] == {"module-a/alpha": None, "module-a/beta": "new", "module-b/alpha": None}, b
assert c["new"] == [], c
assert c["transitions"] == {"module-a/alpha": "regressed", "module-a/beta": None, "module-b/alpha": None}, c
assert d["new"] == [], d
assert d["transitions"] == {"module-a/alpha": "fixed", "module-a/beta": None, "module-b/alpha": None}, d
assert [state["history"] for state in (a, b, c, d)] == [1, 2, 2, 2], [a, b, c, d]
assert not (root / "config/history").exists(), "historyPath must resolve against the working directory"

print("history smoke: repeated tests leave NEW, new tests stay NEW, regressed/fixed and historyLimit come from Allure")
PY

echo "history smoke test passed!"
