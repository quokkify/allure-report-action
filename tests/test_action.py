from __future__ import annotations

import json
import re
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AllureReportActionTests(unittest.TestCase):
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
            re.compile(r"module-source-root:.*?default: \"\"", re.DOTALL),
        )
        self.assertIn("allure-ci.mjs\" module-config", text)
        self.assertIn('--source-root "$MODULE_SOURCE_ROOT"', text)
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

    def test_module_config_recovers_labels_from_existing_source_fragments(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-provenance-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text(
                "export default { variables: {\n"
                "  'Common core.Module': ':common-utils:core',\n"
                "  'Common core.Runner': 'runner-core',\n"
                "  'Data sql.Module': ':data-utils:sql',\n"
                "  'Data sql.Runner': 'runner-sql',\n"
                "  'GitHub.RunId': '123',\n"
                "} };\n"
            )

            fixtures = (
                ("test-report-common", "Common core", ":common-utils:core", "core-case"),
                ("test-report-data", "Data sql", ":data-utils:sql", "sql-case"),
            )
            for artifact, prefix, module, uuid in fixtures:
                source = root / "artifacts" / artifact / "build" / "allure-results"
                source.mkdir(parents=True)
                (source / "ci-env-fragment.properties").write_text(
                    f"{prefix}.Suite=Gradle TestNG\n{prefix}.Module={module}\n"
                )
                document = {
                    "uuid": uuid,
                    "name": uuid,
                    "status": "passed",
                    "labels": [{"name": "epic", "value": "unit"}],
                }
                encoded = json.dumps(document)
                (source / f"{uuid}-result.json").write_text(encoded)
                (results / f"{uuid}-result.json").write_text(encoded)

            effective = root / "effective.mjs"
            prepared = subprocess.run(
                [
                    "node",
                    str(ROOT / "allure-ci.mjs"),
                    "module-config",
                    "--results",
                    str(results),
                    "--source-root",
                    str(root / "artifacts"),
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
            self.assertIn("Recovered module labels for 2 result(s) from 2 source directories", prepared.stdout)
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
                        "variables": {"Module": ":common-utils:core", "Runner": "runner-core"},
                    },
                    "data-utils-sql": {
                        "name": ":data-utils:sql",
                        "variables": {"Module": ":data-utils:sql", "Runner": "runner-sql"},
                    },
                },
            )

    def test_module_config_defaults_source_root_to_results_parent(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-default-source-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            source = root / "artifacts" / "test-report" / "build" / "allure-results"
            results.mkdir(parents=True)
            source.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text("export default {};\n")
            document = {"uuid": "default-source", "name": "case", "labels": []}
            encoded = json.dumps(document)
            (results / "default-source-result.json").write_text(encoded)
            (source / "default-source-result.json").write_text(encoded)
            (source / "ci-env-fragment.properties").write_text("Suite.Module=module-a\n")

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
                    str(root / "effective.mjs"),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            self.assertIn("Recovered module labels for 1 result(s) from 1 source directories", prepared.stdout)
            recovered = json.loads((results / "default-source-result.json").read_text())
            self.assertEqual(recovered["labels"], [{"name": "module", "value": "module-a"}])

    def test_module_config_keeps_direct_label_over_discovered_provenance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-direct-label-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            source = root / "artifacts" / "test-report" / "build" / "allure-results"
            results.mkdir(parents=True)
            source.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text("export default {};\n")
            merged = {
                "uuid": "direct",
                "name": "case",
                "labels": [{"name": "module", "value": "direct-module"}],
            }
            source_document = {"uuid": "direct", "name": "case", "labels": []}
            (results / "direct-result.json").write_text(json.dumps(merged))
            (source / "direct-result.json").write_text(json.dumps(source_document))
            (source / "ci-env-fragment.properties").write_text("Suite.Module=source-module\n")

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
                    str(root / "effective.mjs"),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertEqual(prepared.returncode, 0, prepared.stderr)
            self.assertIn("Recovered module labels for 0 result(s) from 1 source directories", prepared.stdout)
            preserved = json.loads((results / "direct-result.json").read_text())
            self.assertEqual(
                preserved["labels"], [{"name": "module", "value": "direct-module"}]
            )

    def test_module_config_rejects_conflicting_result_provenance(self) -> None:
        with tempfile.TemporaryDirectory(prefix="allure-report-action-conflict-") as tmp:
            root = Path(tmp)
            results = root / "artifacts" / "allure-results"
            results.mkdir(parents=True)
            config = root / "allurerc.mjs"
            config.write_text("export default {};\n")
            document = {"uuid": "collision", "name": "case", "labels": []}
            encoded = json.dumps(document)
            (results / "collision-result.json").write_text(encoded)
            for artifact, module in (("source-a", "module-a"), ("source-b", "module-b")):
                source = root / "artifacts" / artifact / "allure-results"
                source.mkdir(parents=True)
                (source / "collision-result.json").write_text(encoded)
                (source / "ci-env-fragment.properties").write_text(
                    f"Suite.Module={module}\n"
                )

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
                    str(root / "effective.mjs"),
                    "--module-label",
                    "module",
                ],
                text=True,
                capture_output=True,
                check=False,
            )

            self.assertNotEqual(prepared.returncode, 0)
            self.assertIn(
                "Conflicting module provenance for collision-result.json: module-a and module-b",
                prepared.stderr,
            )

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
