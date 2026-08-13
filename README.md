# allure-report-action

Generated with `quokkify/project-toolkit` at `v2.12.1`. Run `copier update` to apply future template changes; Renovate updates workflow version references independently.

Build an Allure 3 HTML report from an already-merged results directory, generate the existing outcome badges and optional test-pyramid files, optionally publish the report to a GitHub Pages subdirectory, and finally create or update one pull-request comment with total and passed test counts.

Tests do **not** need Allure `epic` metadata. Results without a recognized `epic` remain in the overall totals. The preserved CSP fallback classifies Playwright results as `E2E`; other unclassified results appear under `No epic assigned` so the missing relationship is explicit.

Every generated pull-request comment ends with a link to this action, the bundled action version that generated it, and the latest release. This keeps immutable SHA pins visible while making upgrades discoverable.

## Usage

```yaml
permissions:
  contents: write # required only when publish-pages is true
  pull-requests: write

steps:
  - uses: quokkify/allure-report-action@<full-commit-sha> # v0.1.0
    with:
      github-token: ${{ secrets.GITHUB_TOKEN }}
      results-directory: artifacts/allure-results
      report-directory: allure-report
      config-file: scripts/allure/allurerc.mjs
      allure-version: "3.14.2"
      pr-number: ${{ github.event.pull_request.number }}
      comment-marker: "<!-- my-project-allure-ci -->"
```

Pin the action to a full commit SHA. The version comment documents the corresponding release without weakening the immutable reference.

The action uses the caller repository from the GitHub Actions context and an explicitly supplied token, so the same action works in public and private repositories. Private organizations must allow this public action in their Actions policy. GitHub Pages publishing is disabled by default and is not required for the PR summary comment.

## Module-scoped environments and variables

By default, each distinct Allure result label named `module` becomes its own report environment. This prevents tests and variables from unrelated modules being mixed in one broad environment. A producer may add a stable module label directly, for example:

```json
{"name": "module", "value": "common-utils:awaitility"}
```

When `source-artifacts-directory` is set, the action owns the merge as well as attribution. It recursively finds per-job `allure-results` directories, reads exactly one `Module` or `<prefix>.Module` value from each colocated `ci-env-fragment.properties`, preserves the bounded fragment variables for module environment generation, replaces module labels with that authoritative provenance, and atomically rebuilds `results-directory`. Conflicting duplicate filenames or fragment variables, missing provenance, malformed results, symlinks, and oversized inputs fail closed. Byte-identical duplicates are deduplicated. This keeps reusable report preparation out of consumers: a repository that already publishes module metadata fragments receives the behavior by updating its project-toolkit reference, without adding a result-rewriting or merge implementation.

Set `source-artifacts-directory: auto` in a reusable wrapper to inspect the parent of `results-directory`. Auto mode activates the strict merge only when attributed source directories are present, preserves legacy pre-merged results when none use the sidecar contract, and fails on partial provenance. This lets one toolkit version serve matrix-module producers and existing single-project templates without repository-specific scripts.

The action keeps caller configuration global variables in the default environment. A variable whose key follows `<module>.<field>` moves to that module and is displayed as `<field>`; for example, `common-utils:awaitility.Runner` becomes `Runner` only in the `common-utils:awaitility` environment. Matching is case-insensitive, punctuation-insensitive, and ignores the generic token `utils`, so existing human-readable prefixes such as `Common awaitility.Runner` are also supported. Variables that match no module stay global. Once at least one result carries the configured module label, `<module>.Module` values also register zero-test modules so their metadata does not leak back into the global environment.

In legacy mode (`source-artifacts-directory` is empty), the action keeps the already-merged directory unchanged and uses direct result labels. Results without the configured label stay in Allure's `default` environment. If the directory contains no such labels, the action preserves the caller's `environments` unchanged. Set `module-environment-label: ""` to disable normalization, or set it to another explicit label name when the producer already uses a different module contract.

## Optional GitHub Pages preview

```yaml
      pages-url: https://${{ github.repository_owner }}.github.io/${{ github.event.repository.name }}/allure/pr-${{ github.event.pull_request.number }}/
      publish-pages: "true"
      pages-destination-directory: allure/pr-${{ github.event.pull_request.number }}
      pages-retention-count: "20"
```

Pages publishing delegates to the immutable `quokkify/gh-pages-subdir-action` release embedded in `action.yml`. It preserves sibling deployments and prunes only the configured number of sibling `pr-N` report directories.

## Optional CSP-compatible test-pyramid outputs

```yaml
      pyramid-enabled: "true"
      pyramid-source-run-id: ${{ github.run_id }}
      pyramid-head-sha: ${{ github.sha }}
      pyramid-policy-path: docs/testing/test-pyramid.md
```

This preserves the original CSP commands and output paths:

- `docs/testing/pyramid-snapshot.md`
- `docs/testing/pyramid-snapshot.json`
- `docs/testing/pyramid-quality-gates.json`
- uploaded artifact `pyramid-snapshot`

Unknown or absent `epic` values emit an advisory warning only; they do not fail report generation or disappear from total/passed counts. Playwright results without Epic retain the existing `E2E` fallback.

## Main inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `github-token` | yes | — | Token used to create/update the PR comment and, optionally, publish Pages. |
| `results-directory` | no | `artifacts/allure-results` | Prepared results destination, or already-merged results in legacy mode. |
| `report-directory` | no | `allure-report` | Generated HTML report directory. |
| `config-file` | yes | — | Caller-owned Allure 3 configuration file. |
| `module-environment-label` | no | `module` | Result label used to create one environment per module; empty disables normalization. |
| `source-artifacts-directory` | no | empty | Source root, `auto` for compatible wrapper detection, or empty for legacy pre-merged results. |
| `categories-file` | no | empty | Optional caller-owned `categories.json`. |
| `allure-version` | no | `3.14.2` | Exact Allure CLI version. |
| `pr-number` | no | empty | PR to comment on; empty skips the API mutation. |
| `comment-marker` | no | `<!-- project-toolkit-allure-ci -->` | Hidden marker for idempotent updates. Existing comments are updated only when they were created by the identity behind `github-token`. |
| `comment-author-login` | no | `github-actions[bot]` | Expected author for installation-token comments. PAT/user-token logins are resolved automatically; custom GitHub App installation tokens must pass `<app-slug>[bot]`. |
| `pyramid-enabled` | no | `false` | Generate and upload the original epic-based pyramid outputs. |
| `pyramid-policy-path` | no | empty | Optional caller-repository policy file linked from the pyramid snapshot. |
| `publish-pages` | no | `false` | Publish HTML through the embedded Pages action. |

See [`action.yml`](action.yml) for the complete versioned input contract.

## Development

Requirements: Node.js 24+, Python 3 with PyYAML, and Bash.

```bash
node --check allure-ci.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
bash tests/smoke.sh
```

The tests cover atomic provenance-aware merging, strict failure boundaries, legacy merged mode, and module environment generation. The smoke test generates a real Allure 3.14.2 HTML report from per-module source directories, verifies module-scoped environments and variables, and covers Playwright and unlabeled results without `epic` metadata.

## License

MIT. See [LICENSE](LICENSE).
