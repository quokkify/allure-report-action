#!/usr/bin/env bash
# End-to-end regression guard for the bundled action entry point (dist/index.cjs):
# - attachments that would become active files on the Pages origin are published as passive files;
# - the npx-resolved Allure CLI runs without token variables and with npm install scripts disabled.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP="$(mktemp -d "${RUNNER_TEMP:-/tmp}/allure-report-action-action-smoke-XXXXXX")"
trap 'rm -rf "$TMP"' EXIT

ALLURE_VERSION="$(python3 - "$ROOT/action.yml" <<'PY'
import re
import sys

text = open(sys.argv[1]).read()
match = re.search(r'^  allure-version:\n(?:    [^\n]*\n)*?    default:\s*"?(\d+\.\d+\.\d+)"?\s*$', text, re.M)
print(match.group(1))
PY
)"

mkdir -p "$TMP/results"
python3 - "$TMP/results" <<'PY'
import base64
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
attachments = {
    "page-attachment": ("text/html", "<p>extensionless markup</p>"),
    "padded-attachment.html": ("text/html", " " * (70 * 1024) + "<p>late markup</p>"),
    "chart-attachment.svg": ("image/svg+xml", '<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    "screenshot-attachment.png": ("image/png", "png bytes"),
    "log-attachment.txt": ("text/plain", "plain log"),
}
for name, (_, content) in attachments.items():
    (root / name).write_text(content)
(root / "case-result.json").write_text(json.dumps({
    "uuid": "case",
    "name": "case",
    "status": "passed",
    "stage": "finished",
    "start": 1,
    "stop": 2,
    "labels": [],
    "attachments": [
        {"name": name, "source": name, "type": content_type}
        for name, (content_type, _) in attachments.items()
    ],
}))
(root / "cucumber.json").write_text(json.dumps([{
    "id": "feature",
    "uri": "feature.feature",
    "name": "Feature",
    "keyword": "Feature",
    "elements": [{
        "id": "scenario",
        "name": "Scenario",
        "keyword": "Scenario",
        "type": "scenario",
        "steps": [{
            "name": "step",
            "keyword": "Given ",
            "result": {"status": "passed", "duration": 1},
            "embeddings": [{
                "mime_type": "text/html",
                "data": base64.b64encode(b"<p>embedded markup</p>").decode(),
            }],
        }],
    }],
}]))
PY

cat > "$TMP/allurerc.mjs" <<'JS'
import { writeFileSync } from "node:fs";

writeFileSync(
  process.env.ALLURE_SMOKE_ENV_DUMP,
  JSON.stringify(
    Object.fromEntries(
      Object.entries(process.env).map(([name, value]) => [
        name,
        value === "smoke-secret" ? "leaked" : name === "npm_config_ignore_scripts" ? value : "",
      ])
    )
  )
);

export default { name: "action-smoke" };
JS

(
  cd "$TMP"
  env \
    GITHUB_ACTION_PATH="$ROOT" \
    ALLURE_SMOKE_ENV_DUMP="$TMP/allure-env.json" \
    GITHUB_TOKEN=smoke-secret \
    GH_TOKEN=smoke-secret \
    ACTIONS_RUNTIME_TOKEN=smoke-secret \
    ACTIONS_ID_TOKEN_REQUEST_TOKEN=smoke-secret \
    ACTIONS_ID_TOKEN_REQUEST_URL=https://token.invalid \
    "INPUT_GITHUB-TOKEN=smoke-secret" \
    "INPUT_RESULTS-DIRECTORY=results" \
    "INPUT_REPORT-DIRECTORY=report" \
    "INPUT_CONFIG-FILE=allurerc.mjs" \
    "INPUT_ALLURE-VERSION=$ALLURE_VERSION" \
    "INPUT_COMMENT-FILE=comment.md" \
    "INPUT_FORK-PR=false" \
    "INPUT_PYRAMID-ENABLED=false" \
    "INPUT_PUBLISH-PAGES=false" \
    "INPUT_COMMENT-MARKER=<!-- allure-report-action-action-smoke -->" \
    node "$ROOT/dist/index.cjs"
)

python3 - "$TMP" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
assert (root / "report/index.html").is_file(), "report was not generated"

passive = {".txt", ".png", ".json"}
attachments = [p for p in (root / "report").rglob("*") if p.is_file() and p.parent.name == "attachments" and p.parent.parent.name == "data"]
assert attachments, "no attachments were published"
for attachment in attachments:
    assert attachment.suffix.lower() in passive or attachment.read_text(errors="ignore").startswith(
        "This attachment was withheld"
    ), f"active attachment published: {attachment.name}"
contents = {p.read_text(errors="ignore") for p in attachments}
assert "png bytes" in contents and "plain log" in contents, "legitimate attachments changed"
assert "<p>extensionless markup</p>" in contents, "extensionless evidence was not kept as text"

env = json.loads((root / "allure-env.json").read_text())
leaked = sorted(
    name for name, value in env.items()
    if value == "leaked" or name.upper().startswith("INPUT_") or name.upper().startswith("ACTIONS_ID_TOKEN_REQUEST_")
)
assert not leaked, f"token-bearing variables reached the Allure CLI: {leaked}"
assert env.get("npm_config_ignore_scripts") == "true", "npm install scripts were not disabled"
print("action smoke: passive attachments, stripped environment, scripts disabled OK")
PY
