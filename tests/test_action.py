from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AllureReportActionTests(unittest.TestCase):
    def run_cli(self, *args: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", str(ROOT / "allure-ci.mjs"), *args],
            text=True,
            capture_output=True,
            check=False,
        )

    def test_metadata_keeps_pages_optional_and_comments_last(self) -> None:
        text = (ROOT / "action.yml").read_text()
        self.assertIn("runs:\n  using: composite", text)
        self.assertRegex(text, r"github-token:\n\s+description:.*\n\s+required: true")
        self.assertRegex(text, re.compile(r"publish-pages:.*?default: \"false\"", re.DOTALL))
        self.assertRegex(text, re.compile(r"pyramid-enabled:.*?default: \"false\"", re.DOTALL))
        self.assertRegex(text, re.compile(r"pyramid-policy-path:.*?default: \"\"", re.DOTALL))
        self.assertIn('default: "<!-- project-toolkit-allure-ci -->"', text)
        self.assertLess(
            text.index("name: Deploy Allure HTML to GitHub Pages"),
            text.index("name: Post or update Allure comment on PR"),
        )
        self.assertIn("github-token: ${{ inputs.github-token }}", text)
        self.assertRegex(
            text,
            re.compile(r"module-environment-label:.*?default: \"module\"", re.DOTALL),
        )
        self.assertRegex(
            text,
            re.compile(r"source-artifacts-directory:.*?default: \"\"", re.DOTALL),
        )
        self.assertIn('allure-ci.mjs\" prepare-results', text)
        self.assertIn("allure-ci.mjs\" module-config", text)
        self.assertIn('--source-root "$SOURCE_ARTIFACTS_DIRECTORY"', text)
        self.assertIn("owner: context.repo.owner", text)
        self.assertIn("repo: context.repo.repo", text)
        self.assertIn("github.paginate(github.rest.issues.listComments", text)
        self.assertIn("github.rest.users.getAuthenticated()", text)
        self.assertIn('COMMENT_AUTHOR_LOGIN: ${{ inputs.comment-author-login }}', text)
        self.assertIn('default: "github-actions[bot]"', text)
        self.assertNotIn("github.request('GET /installation')", text)
        self.assertIn("c.user?.login === expectedAuthor", text)
        self.assertIn("inputs.publish-pages == 'true' && inputs.fork-pr != 'true'", text)
        self.assertIn('--policy-path "$PYRAMID_POLICY_PATH"', text)
        self.assertNotIn("c.user?.login === 'github-actions[bot]'", text)
        self.assertNotIn(
            "const existing = comments.find((c) => (c.body || '').includes(marker));",
            text,
        )
        self.assertNotIn("api.github.com", text)

    def test_comment_upsert_matches_marker_and_authenticated_owner(self) -> None:
        text = (ROOT / "action.yml").read_text()
        marker = "        script: |\n"
        start = text.index(marker) + len(marker)
        script_lines: list[str] = []
        for line in text[start:].splitlines():
            if line and not line.startswith("          "):
                break
            script_lines.append(line[10:] if line else "")
        script = "\n".join(script_lines)
        harness = "const embeddedScript = " + json.dumps(script) + ";\n" + r"""
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const marker = '<!-- secure-allure -->';

async function runCase({ userLogin, userStatus, authorLogin = 'github-actions[bot]', comments }) {
  const calls = { updated: null, created: null, failed: null };
  const github = {
    paginate: async (_method, args) => {
      calls.paginate = args;
      return comments;
    },
    request: async (route) => { throw new Error(`unexpected route ${route}`); },
    rest: {
      users: {
        getAuthenticated: async () => {
          if (userStatus) throw Object.assign(new Error('not a user token'), { status: userStatus });
          return { data: { login: userLogin } };
        }
      },
      issues: {
        listComments: async () => { throw new Error('paginate must be used'); },
        updateComment: async (args) => { calls.updated = args; },
        createComment: async (args) => { calls.created = args; }
      }
    }
  };
  const context = { repo: { owner: 'caller', repo: 'consumer' } };
  const core = {
    info: () => {},
    setFailed: (message) => { calls.failed = message; }
  };
  const testProcess = { env: {
    PR_NUMBER_RESOLVED: '42',
    COMMENT_FILE: '/tmp/comment.md',
    COMMENT_MARKER: marker,
    COMMENT_AUTHOR_LOGIN: authorLogin
  } };
  const testRequire = (name) => name === 'fs'
    ? { readFileSync: () => `new report\n${marker}` }
    : require(name);
  const execute = new AsyncFunction('github', 'context', 'core', 'require', 'process', embeddedScript);
  await execute(github, context, core, testRequire, testProcess);
  return calls;
}

(async () => {
  const pat = await runCase({
    userLogin: 'report-owner',
    comments: [
      { id: 1, user: { login: 'attacker' }, body: marker },
      { id: 2, user: { login: 'report-owner' }, body: marker }
    ]
  });
  if (pat.updated?.comment_id !== 2 || pat.created || pat.failed) throw new Error('PAT owner match failed');

  const actionsToken = await runCase({
    userStatus: 403,
    comments: [
      { id: 3, user: { login: 'attacker' }, body: marker },
      { id: 4, user: { login: 'github-actions[bot]' }, body: marker }
    ]
  });
  if (actionsToken.updated?.comment_id !== 4 || actionsToken.created || actionsToken.failed) {
    throw new Error('GITHUB_TOKEN owner match failed');
  }

  const app = await runCase({
    userStatus: 403,
    authorLogin: 'report-app[bot]',
    comments: [
      { id: 5, user: { login: 'attacker' }, body: marker },
      { id: 6, user: { login: 'report-app[bot]' }, body: marker }
    ]
  });
  if (app.updated?.comment_id !== 6 || app.created || app.failed) {
    throw new Error('explicit GitHub App owner match failed');
  }

  const unowned = await runCase({
    userLogin: 'report-owner',
    comments: [{ id: 7, user: { login: 'attacker' }, body: marker }]
  });
  if (unowned.updated || unowned.created?.issue_number !== 42 || unowned.failed) {
    throw new Error('unowned marker must create a new comment');
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
"""
        result = subprocess.run(
            ["node", "-e", harness],
            text=True,
            capture_output=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_module_config_splits_module_variables_and_preserves_global_values(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-modules-") as tmp:
            root = Path(tmp)
            results = root / "results"
            results.mkdir()
            config = root / "allurerc.mjs"
            config.write_text(
                "export default {\n"
                "  variables: {\n"
                "    'GitHub.RunId': '123',\n"
                "    'Default.Runner': 'runner-default',\n"
                "    'Module A.Runner': 'runner-a',\n"
                "    'Module B.Runner': 'runner-b',\n"
                "    'Module C.Module': 'module-c',\n"
                "    'Module C.Runner': 'runner-c',\n"
                "  },\n"
                "};\n"
            )
            for module in ("default", "module-a", "module-b"):
                (results / f"{module}-result.json").write_text(
                    json.dumps(
                        {
                            "uuid": module,
                            "name": module,
                            "status": "passed",
                            "labels": [{"name": "module", "value": module}],
                        }
                    )
                )
            effective = root / "effective.mjs"
            prepared = subprocess.run(
                [
                    "node",
                    str(ROOT / "allure-ci.mjs"),
                    "module-config",
                    "--results",
                    str(results),
                    "--config",
                    str(config),
                    "--output",
                    str(effective),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            probe = subprocess.run(
                [
                    "node",
                    "--input-type=module",
                    "-e",
                    (
                        "const c=(await import(process.argv[1])).default;"
                        "const e=Object.fromEntries(Object.entries(c.environments).map(([id,v])=>"
                        "[id,{name:v.name,variables:v.variables,matches:v.matcher({labels:[{name:'module',value:v.name}]})}]));"
                        "console.log(JSON.stringify({variables:c.variables,environments:e}));"
                    ),
                    effective.as_uri(),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(probe.returncode, 0, probe.stderr)
            rendered = json.loads(probe.stdout)
            self.assertEqual(rendered["variables"], {"GitHub.RunId": "123"})
            self.assertEqual(
                rendered["environments"],
                {
                    "default-2": {
                        "name": "default",
                        "variables": {"Runner": "runner-default"},
                        "matches": True,
                    },
                    "module-a": {
                        "name": "module-a",
                        "variables": {"Runner": "runner-a"},
                        "matches": True,
                    },
                    "module-b": {
                        "name": "module-b",
                        "variables": {"Runner": "runner-b"},
                        "matches": True,
                    },
                    "module-c": {
                        "name": "module-c",
                        "variables": {"Module": "module-c", "Runner": "runner-c"},
                        "matches": True,
                    },
                },
            )

    def test_prepare_results_merges_sources_before_module_config(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-provenance-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text(
                "export default { variables: {\n"
                "  'GitHub.RunId': '123',\n"
                "} };\n"
            )

            fixtures = (
                (
                    "test-report-common",
                    "Common q4j-core",
                    ":common-utils:core",
                    "core-case",
                ),
                (
                    "test-report-data",
                    "Data q4j-sql",
                    ":data-utils:sql",
                    "sql-case",
                ),
            )
            for artifact, prefix, module, uuid in fixtures:
                source = root / "artifacts" / artifact / "build" / "allure-results"
                source.mkdir(parents=True)
                (source / "ci-env-fragment.properties").write_text(
                    f"{prefix}.Suite=Gradle TestNG\n"
                    f"{prefix}.Module={module}\n"
                    f"{prefix}.Runner=runner-{uuid.removesuffix('-case')}\n"
                )
                document = {
                    "uuid": uuid,
                    "name": uuid,
                    "status": "passed",
                    "labels": [{"name": "epic", "value": "unit"}],
                }
                encoded = json.dumps(document)
                (source / f"{uuid}-result.json").write_text(encoded)

            (results / "stale-result.json").write_text(json.dumps({"uuid": "stale"}))
            (results / "environment.properties").write_text("GitHub.RunId=123\n")

            merged = subprocess.run(
                [
                    "node",
                    str(ROOT / "allure-ci.mjs"),
                    "prepare-results",
                    "--results",
                    str(results),
                    "--source-root",
                    str(root / "artifacts"),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(merged.returncode, 0, merged.stderr)
            self.assertIn(
                "Prepared 2 attributed result(s) from 2 source directories (2 files)",
                merged.stdout,
            )
            self.assertFalse((results / "stale-result.json").exists())
            self.assertEqual(
                (results / "environment.properties").read_text(), "GitHub.RunId=123\n"
            )

            effective = root / "effective.mjs"
            prepared = subprocess.run(
                [
                    "node",
                    str(ROOT / "allure-ci.mjs"),
                    "module-config",
                    "--results",
                    str(results),
                    "--config",
                    str(config),
                    "--output",
                    str(effective),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            for _, _, module, uuid in fixtures:
                document = json.loads((results / f"{uuid}-result.json").read_text())
                self.assertEqual(
                    [label for label in document["labels"] if label.get("name") == "module"],
                    [{"name": "module", "value": module}],
                )

            probe = subprocess.run(
                [
                    "node",
                    "--input-type=module",
                    "-e",
                    (
                        "const c=(await import(process.argv[1])).default;"
                        "console.log(JSON.stringify(Object.fromEntries("
                        "Object.entries(c.environments).map(([id,v])=>[id,{name:v.name,variables:v.variables}])"
                        ")));"
                    ),
                    effective.as_uri(),
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(probe.returncode, 0, probe.stderr)
            self.assertEqual(
                json.loads(probe.stdout),
                {
                    "common-utils-core": {
                        "name": ":common-utils:core",
                        "variables": {
                            "Module": ":common-utils:core",
                            "Runner": "runner-core",
                            "Suite": "Gradle TestNG",
                        },
                    },
                    "data-utils-sql": {
                        "name": ":data-utils:sql",
                        "variables": {
                            "Module": ":data-utils:sql",
                            "Runner": "runner-sql",
                            "Suite": "Gradle TestNG",
                        },
                    },
                },
            )

    def test_module_config_keeps_legacy_already_merged_mode(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-legacy-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            source = root / "artifacts" / "test-report" / "build" / "allure-results"
            results.mkdir(parents=True)
            source.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text("export default {};\n")
            document = {"uuid": "legacy", "name": "case", "labels": []}
            encoded = json.dumps(document)
            (results / "legacy-result.json").write_text(encoded)
            (source / "legacy-result.json").write_text(encoded)
            (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")

            prepared = self.run_cli(
                "module-config",
                "--results",
                str(results),
                "--config",
                str(config),
                "--output",
                str(root / "effective.mjs"),
                "--module-label",
                "module",
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            unchanged = json.loads((results / "legacy-result.json").read_text())
            self.assertEqual(unchanged["labels"], [])

    def test_prepare_results_uses_sidecar_as_authoritative_module(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-authoritative-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            source = root / "artifacts" / "test-report" / "build" / "allure-results"
            source.mkdir(parents=True)
            source_document = {
                "uuid": "direct",
                "name": "case",
                "labels": [
                    {"name": "module", "value": "direct-module"},
                    {"name": "module", "value": "duplicate-module"},
                    {"name": "epic", "value": "unit"},
                ],
            }
            (source / "direct-result.json").write_text(json.dumps(source_document))
            (source / "ci-env-fragment.properties").write_text("Suite.Module=source-module\n")

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            merged = json.loads((results / "direct-result.json").read_text())
            self.assertEqual(
                merged["labels"],
                [
                    {"name": "epic", "value": "unit"},
                    {"name": "module", "value": "source-module"},
                ],
            )

    def test_prepare_results_rejects_conflicting_duplicate_name_atomically(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-conflict-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            (results / "sentinel.txt").write_text("unchanged\n")
            for artifact in ("source-a", "source-b"):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                document = {"uuid": "collision", "name": artifact, "labels": []}
                (source / "collision-result.json").write_text(json.dumps(document))
                (source / "ci-env-fragment.properties").write_text(
                    "Suite.Module=module-a\n"
                )

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn("Conflicting source files named collision-result.json", prepared.stderr)
            self.assertEqual((results / "sentinel.txt").read_text(), "unchanged\n")

    def test_prepare_results_deduplicates_identical_files(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-deduplicate-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            document = {"uuid": "same", "name": "case", "labels": []}
            for artifact in ("source-a", "source-b"):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                (source / "same-result.json").write_text(json.dumps(document))
                (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            self.assertEqual(len(list(results.glob("*-result.json"))), 1)

    def test_prepare_results_deduplicates_identical_fragment_variables_deterministically(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-variable-deduplicate-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            for artifact, uuid in (("source-b", "case-b"), ("source-a", "case-a")):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                (source / f"{uuid}-result.json").write_text(
                    json.dumps({"uuid": uuid, "labels": []})
                )
                (source / "ci-env-fragment.properties").write_text(
                    "Z.Shared=same\nA.Module=module-a\nA.Runner=runner-a\n"
                )

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            metadata = results / ".allure-module-variables.json"
            self.assertEqual(
                metadata.read_text(),
                '{"A.Module":"module-a","A.Runner":"runner-a","Z.Shared":"same"}',
            )
            self.assertEqual(metadata.stat().st_mode & 0o777, 0o600)

    def test_prepare_results_rejects_conflicting_fragment_variables_atomically(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-variable-conflict-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            (results / "sentinel.txt").write_text("unchanged\n")
            for artifact, value in (("source-a", "one"), ("source-b", "two")):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                (source / f"{artifact}-result.json").write_text(
                    json.dumps({"uuid": artifact, "labels": []})
                )
                (source / "ci-env-fragment.properties").write_text(
                    f"Suite.Module=module-a\nSuite.Runner={value}\n"
                )

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn("Conflicting environment variable Suite.Runner", prepared.stderr)
            self.assertEqual((results / "sentinel.txt").read_text(), "unchanged\n")
            self.assertFalse((results / ".allure-module-variables.json").exists())

    def test_prepare_results_enforces_fragment_variable_count_boundary(self) -> None:
        for count, succeeds in ((10_000, True), (10_001, False)):
            with self.subTest(count=count):
                with tempfile.TemporaryDirectory(prefix="allure-report-action-variable-count-") as tmp:
                    root = Path(tmp)
                    source = root / "artifacts" / "source" / "allure-results"
                    results = root / "artifacts" / "allure-results"
                    source.mkdir(parents=True)
                    (source / "case-result.json").write_text(
                        json.dumps({"uuid": "case", "labels": []})
                    )
                    variables = ["Suite.Module=module-a"]
                    variables.extend(f"K{index}=v" for index in range(count - 1))
                    (source / "ci-env-fragment.properties").write_text("\n".join(variables))

                    prepared = self.run_cli(
                        "prepare-results",
                        "--results",
                        str(results),
                        "--source-root",
                        str(root / "artifacts"),
                        "--module-label",
                        "module",
                    )

                    self.assertEqual(prepared.returncode == 0, succeeds, prepared.stderr)
                    if succeeds:
                        self.assertEqual(
                            len(json.loads((results / ".allure-module-variables.json").read_text())),
                            count,
                        )
                    else:
                        self.assertIn("exceed count or byte limits", prepared.stderr)

    def test_prepare_results_rejects_reserved_metadata_filename(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-reserved-metadata-") as tmp:
            root = Path(tmp)
            source = root / "artifacts" / "source" / "allure-results"
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            (results / "sentinel.txt").write_text("unchanged\n")
            source.mkdir(parents=True)
            (source / "case-result.json").write_text(json.dumps({"uuid": "case", "labels": []}))
            (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")
            (source / ".allure-module-variables.json").write_text(
                '{"Suite.Module":"module-a"}'
            )

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn("Reserved source result filename is not allowed", prepared.stderr)
            self.assertEqual((results / "sentinel.txt").read_text(), "unchanged\n")

    def test_module_config_rejects_invalid_module_variable_metadata(self) -> None:
        fixtures = (
            ("malformed", "{", "Malformed module environment metadata"),
            ("array", "[]", "Invalid module environment metadata"),
            ("null", "null", "Invalid module environment metadata"),
            ("non-string", '{"Suite.Module":42}', "Invalid module environment metadata"),
            ("prototype", '{"__proto__":"attacker"}', "Invalid module environment metadata"),
        )
        for fixture, metadata, expected in fixtures:
            with self.subTest(fixture=fixture):
                with tempfile.TemporaryDirectory(prefix=f"allure-report-action-metadata-{fixture}-") as tmp:
                    root = Path(tmp)
                    results = root / "results"
                    results.mkdir()
                    (results / "case-result.json").write_text(
                        json.dumps(
                            {
                                "uuid": "case",
                                "labels": [{"name": "module", "value": "module-a"}],
                            }
                        )
                    )
                    (results / ".allure-module-variables.json").write_text(metadata)
                    config = root / "allurerc.mjs"
                    config.write_text("export default {};\n")
                    prepared = self.run_cli(
                        "module-config",
                        "--results",
                        str(results),
                        "--config",
                        str(config),
                        "--output",
                        str(root / "effective.mjs"),
                        "--module-label",
                        "module",
                    )
                    self.assertNotEqual(prepared.returncode, 0)
                    self.assertIn(expected, prepared.stderr)
                    self.assertFalse((root / "effective.mjs").exists())

    def test_module_config_enforces_metadata_size_boundary(self) -> None:
        limit = 4 * 1024 * 1024
        for size, succeeds in ((limit, True), (limit + 1, False)):
            with self.subTest(size=size):
                with tempfile.TemporaryDirectory(prefix="allure-report-action-metadata-size-") as tmp:
                    root = Path(tmp)
                    results = root / "results"
                    results.mkdir()
                    (results / "case-result.json").write_text(
                        json.dumps(
                            {
                                "uuid": "case",
                                "labels": [{"name": "module", "value": "module-a"}],
                            }
                        )
                    )
                    payload = '{"Suite.Module":"module-a"}'
                    (results / ".allure-module-variables.json").write_text(
                        payload + " " * (size - len(payload))
                    )
                    config = root / "allurerc.mjs"
                    config.write_text("export default {};\n")
                    prepared = self.run_cli(
                        "module-config",
                        "--results",
                        str(results),
                        "--config",
                        str(config),
                        "--output",
                        str(root / "effective.mjs"),
                        "--module-label",
                        "module",
                    )
                    self.assertEqual(prepared.returncode == 0, succeeds, prepared.stderr)
                    if not succeeds:
                        self.assertIn("Invalid module environment metadata", prepared.stderr)

    def test_module_config_rejects_non_regular_module_variable_metadata(self) -> None:
        for fixture in ("symlink", "directory"):
            with self.subTest(fixture=fixture):
                with tempfile.TemporaryDirectory(prefix=f"allure-report-action-metadata-{fixture}-") as tmp:
                    root = Path(tmp)
                    results = root / "results"
                    results.mkdir()
                    metadata = results / ".allure-module-variables.json"
                    if fixture == "symlink":
                        target = root / "outside.json"
                        target.write_text('{"Suite.Module":"attacker"}')
                        metadata.symlink_to(target)
                    else:
                        metadata.mkdir()
                    config = root / "allurerc.mjs"
                    config.write_text("export default {};\n")
                    prepared = self.run_cli(
                        "module-config",
                        "--results",
                        str(results),
                        "--config",
                        str(config),
                        "--output",
                        str(root / "effective.mjs"),
                        "--module-label",
                        "module",
                    )
                    self.assertNotEqual(prepared.returncode, 0)
                    self.assertIn("Invalid module environment metadata", prepared.stderr)

    def test_prepare_results_rejects_missing_module_and_malformed_json(self) -> None:
        for fixture, fragment, content, expected in (
            ("missing", "Suite.Runner=runner\n", "{}", "Expected exactly one module value"),
            ("malformed", "Suite.Module=module-a\n", "{", "Malformed Allure result JSON"),
        ):
            with self.subTest(fixture=fixture):
                with tempfile.TemporaryDirectory(prefix=f"allure-report-action-{fixture}-") as tmp:
                    root = Path(tmp)
                    source = root / "artifacts" / "test-report" / "allure-results"
                    source.mkdir(parents=True)
                    (source / "case-result.json").write_text(content)
                    (source / "ci-env-fragment.properties").write_text(fragment)
                    prepared = self.run_cli(
                        "prepare-results",
                        "--results",
                        str(root / "artifacts" / "allure-results"),
                        "--source-root",
                        str(root / "artifacts"),
                        "--module-label",
                        "module",
                    )
                    self.assertNotEqual(prepared.returncode, 0)
                    self.assertIn(expected, prepared.stderr)

    def test_prepare_results_auto_preserves_legacy_results_without_provenance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-auto-legacy-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            document = {"uuid": "legacy", "labels": [{"name": "module", "value": "direct"}]}
            (results / "legacy-result.json").write_text(json.dumps(document))

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--auto",
                "true",
                "--module-label",
                "module",
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            self.assertIn("preserved legacy merged results", prepared.stdout)
            self.assertEqual(json.loads((results / "legacy-result.json").read_text()), document)

    def test_prepare_results_auto_rejects_partial_provenance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-auto-partial-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            (results / "sentinel.txt").write_text("unchanged\n")
            for artifact in ("source-a", "source-b"):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                (source / f"{artifact}-result.json").write_text(
                    json.dumps({"uuid": artifact, "labels": []})
                )
                if artifact == "source-a":
                    (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(results),
                "--source-root",
                str(root / "artifacts"),
                "--auto",
                "true",
                "--module-label",
                "module",
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn("Partial module provenance: 1 of 2", prepared.stderr)
            self.assertEqual((results / "sentinel.txt").read_text(), "unchanged\n")

    def test_prepare_results_rejects_symlinks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-symlink-") as tmp:
            root = Path(tmp)
            source = root / "artifacts" / "test-report" / "allure-results"
            source.mkdir(parents=True)
            target = root / "outside-result.json"
            target.write_text(json.dumps({"uuid": "outside"}))
            (source / "linked-result.json").symlink_to(target)
            (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")

            prepared = self.run_cli(
                "prepare-results",
                "--results",
                str(root / "artifacts" / "allure-results"),
                "--source-root",
                str(root / "artifacts"),
                "--module-label",
                "module",
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn("Only regular files are allowed", prepared.stderr)

    def test_pr_summary_counts_results_without_epic_using_preserved_fallbacks(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-") as tmp:
            root = Path(tmp)
            results = root / "results"
            widgets = root / "report/widgets"
            results.mkdir()
            widgets.mkdir(parents=True)
            (results / "unit-result.json").write_text(
                json.dumps(
                    {
                        "uuid": "unit",
                        "name": "labeled",
                        "status": "passed",
                        "labels": [{"name": "epic", "value": "unit"}],
                    }
                )
            )
            (results / "plain-result.json").write_text(
                json.dumps(
                    {
                        "uuid": "plain",
                        "name": "without metadata",
                        "status": "passed",
                    }
                )
            )
            (results / "playwright-result.json").write_text(
                json.dumps(
                    {
                        "uuid": "playwright",
                        "name": "without epic but with framework",
                        "status": "passed",
                        "labels": [{"name": "framework", "value": "playwright"}],
                    }
                )
            )
            (widgets / "summary.json").write_text(
                json.dumps(
                    {
                        "statistic": {
                            "total": 3,
                            "passed": 3,
                            "failed": 0,
                            "broken": 0,
                            "skipped": 0,
                            "unknown": 0,
                        }
                    }
                )
            )
            comment = root / "comment.md"
            marker = "<!-- repository-neutral-allure -->"
            result = subprocess.run(
                [
                    "node",
                    str(ROOT / "allure-ci.mjs"),
                    "pr-body",
                    "--results",
                    str(results),
                    "--report",
                    str(root / "report"),
                    "--output",
                    str(comment),
                    "--comment-marker",
                    marker,
                    "--action-version",
                    "0.1.3",
                ],
                text=True,
                capture_output=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            body = comment.read_text()
            self.assertIn("**3** tests · **3** passed · 100% pass rate", body)
            self.assertIn("| Unit | 1 | 1 | 0 | 0 | 0 | 100% |", body)
            self.assertIn("| E2E | 1 | 1 | 0 | 0 | 0 | 100% |", body)
            self.assertIn("| No epic assigned | 1 | 1 | 0 | 0 | 0 | 100% |", body)
            self.assertIn(
                "_Generated by [quokkify/allure-report-action](https://github.com/quokkify/allure-report-action) "
                "`v0.1.3` · [Latest release](https://github.com/quokkify/allure-report-action/releases/latest)._",
                body,
            )
            self.assertTrue(body.endswith(marker))


if __name__ == "__main__":
    unittest.main()
