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
        self.assertIn("owner: context.repo.owner", text)
        self.assertIn("repo: context.repo.repo", text)
        self.assertIn("github.paginate(github.rest.issues.listComments", text)
        self.assertIn("github.rest.users.getAuthenticated()", text)
        self.assertIn("github.request('GET /installation')", text)
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

async function runCase({ userLogin, userStatus, appSlug, comments }) {
  const calls = { updated: null, created: null, failed: null, installation: false };
  const github = {
    paginate: async (_method, args) => {
      calls.paginate = args;
      return comments;
    },
    request: async (route) => {
      if (route !== 'GET /installation') throw new Error(`unexpected route ${route}`);
      calls.installation = true;
      return { data: { app_slug: appSlug } };
    },
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
    COMMENT_MARKER: marker
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

  const app = await runCase({
    userStatus: 403,
    appSlug: 'report-app',
    comments: [
      { id: 3, user: { login: 'attacker' }, body: marker },
      { id: 4, user: { login: 'report-app[bot]' }, body: marker }
    ]
  });
  if (app.updated?.comment_id !== 4 || !app.installation || app.created || app.failed) {
    throw new Error('GitHub App owner match failed');
  }

  const unowned = await runCase({
    userLogin: 'report-owner',
    comments: [{ id: 5, user: { login: 'attacker' }, body: marker }]
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
            self.assertIn("| Other | 1 | 1 | 0 | 0 | 0 | 100% |", body)
            self.assertTrue(body.endswith(marker))


if __name__ == "__main__":
    unittest.main()
