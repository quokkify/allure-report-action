"""Focused regression tests for the local release-note enrichment helper."""
from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("enrich_release_notes.py")
spec = importlib.util.spec_from_file_location("enrich_release_notes", SCRIPT)
assert spec and spec.loader
notes = importlib.util.module_from_spec(spec)
spec.loader.exec_module(notes)


class DependencyCompactionTests(unittest.TestCase):
    def test_repeated_prettier_updates_compact_and_preserve_sources(self) -> None:
        prs = [
            {"number": n, "title": f"chore(deps): update prettier to v{version}",
             "body": "", "pr_url": f"https://github.com/quokkify/allure-report-action/pull/{n}"}
            for n, version in ((93, "3.9.7"), (94, "3.9.8"), (101, "3.9.9"))
        ]
        rendered = notes._render_entries(prs, set())
        self.assertEqual(rendered.count("update prettier to"), 1)
        self.assertIn("update prettier to v3.9.9", rendered)
        for number in (93, 94, 101):
            self.assertIn(f"[#{number}](https://github.com/quokkify/allure-report-action/pull/{number})", rendered)
            self.assertEqual(rendered.count(f"rich-release-notes pr={number}"), 1)
        self.assertEqual(notes._rich_numbers(rendered), {"93", "94", "101"})
        source = "## 2.23.0\n\n### Features\n\n- retained\n\n## 2.22.0\n\n- historical\n"
        enriched = notes.enrich_changelog(source, prs)
        self.assertEqual(notes.enrich_changelog(enriched, prs), enriched)
        self.assertIn("## 2.22.0\n\n- historical", enriched)
        self.assertEqual(notes.source_pr_numbers(
            "## 2.23.0\n\n- change ([#93](https://github.com/quokkify/allure-report-action/pull/93)) "
            "([abcdef0](https://github.com/quokkify/allure-report-action/commit/" + "a" * 40 + "))\n",
            "quokkify/allure-report-action"), [93])

    def test_other_groups_security_and_mixed_rich_notes_are_not_lost(self) -> None:
        prs = [
            {"number": 1, "title": "chore(deps): update prettier to v3.9.7 [security]", "body": ""},
            {"number": 2, "title": "chore(deps): update prettier to v3.9.9", "body": ""},
            {"number": 3, "title": "chore(deps): update vitest to v5.0.1", "body": ""},
            {"number": 4, "title": "chore(deps): update vitest to v5.0.2", "body": "## Migration\nKeep rich detail."},
            {"number": 5, "title": "chore(deps): update package to v1.2.3 for compatibility", "body": ""},
        ]
        output = notes._render_entries(prs, set())
        self.assertIn("update prettier to v3.9.9", output)
        self.assertIn("[security]", output)
        self.assertIn("update vitest to v5.0.2", output)
        self.assertIn("Keep rich detail.", output)
        self.assertIn("update package to v1.2.3 for compatibility", output)
        self.assertEqual(notes._rich_numbers(output), {"1", "2", "3", "4", "5"})

    def test_reserved_rich_delimiters_are_rejected(self) -> None:
        prs = [{"number": 8, "title": "ordinary", "body": "## Release notes\n<!-- project-toolkit:rich-block:end -->\nmalicious"}]
        self.assertEqual(notes._render_entries(prs, set()), "")


if __name__ == "__main__":
    unittest.main()
