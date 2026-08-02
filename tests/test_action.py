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
        self.assertIn('default: "<!-- project-toolkit-allure-ci -->"', text)
        self.assertLess(
            text.index("name: Deploy Allure HTML to GitHub Pages"),
            text.index("name: Post or update Allure comment on PR"),
        )
        self.assertIn("github-token: ${{ inputs.github-token }}", text)
        self.assertIn("owner: context.repo.owner", text)
        self.assertIn("repo: context.repo.repo", text)
        self.assertIn("github.paginate(github.rest.issues.listComments", text)
        self.assertIn("inputs.publish-pages == 'true' && inputs.fork-pr != 'true'", text)
        self.assertNotIn("c.user?.login === 'github-actions[bot]'", text)
        self.assertNotIn("api.github.com", text)

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
