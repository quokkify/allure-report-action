# allure-report-action

Build an Allure 3 HTML report from an already-merged results directory, generate the existing outcome badges and optional test-pyramid files, optionally publish the report to a GitHub Pages subdirectory, and finally create or update one pull-request comment with total and passed test counts.

Tests do **not** need Allure `epic` metadata. Results without a recognized `epic` remain in the overall totals and appear under `Other` in the layer breakdown.

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
      categories-file: .github/allure/categories.json
      allure-version: "3.14.2"
      pr-number: ${{ github.event.pull_request.number }}
      comment-marker: "<!-- my-project-allure-ci -->"
```

Pin the action to a full commit SHA. The version comment documents the corresponding release without weakening the immutable reference.

The action uses the caller repository from the GitHub Actions context and an explicitly supplied token, so the same action works in public and private repositories. Private organizations must allow this public action in their Actions policy. GitHub Pages publishing is disabled by default and is not required for the PR summary comment.

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
```

This preserves the original CSP commands and output paths:

- `docs/testing/pyramid-snapshot.md`
- `docs/testing/pyramid-snapshot.json`
- `docs/testing/pyramid-quality-gates.json`
- uploaded artifact `pyramid-snapshot`

Unknown or absent `epic` values emit an advisory warning only; they do not fail report generation or disappear from total/passed counts.

## Main inputs

| Input | Required | Default | Description |
| --- | --- | --- | --- |
| `github-token` | yes | — | Token used to create/update the PR comment and, optionally, publish Pages. |
| `results-directory` | no | `artifacts/allure-results` | Already-merged Allure result files. |
| `report-directory` | no | `allure-report` | Generated HTML report directory. |
| `config-file` | yes | — | Caller-owned Allure 3 configuration file. |
| `categories-file` | no | empty | Optional caller-owned `categories.json`. |
| `allure-version` | no | `3.14.2` | Exact Allure CLI version. |
| `pr-number` | no | empty | PR to comment on; empty skips the API mutation. |
| `comment-marker` | no | `<!-- project-toolkit-allure-ci -->` | Hidden marker for idempotent comment updates. |
| `pyramid-enabled` | no | `false` | Generate and upload the original epic-based pyramid outputs. |
| `publish-pages` | no | `false` | Publish HTML through the embedded Pages action. |

See [`action.yml`](action.yml) for the complete versioned input contract.

## Development

Requirements: Node.js 24+, Python 3 with PyYAML, and Bash.

```bash
node --check allure-ci.mjs
python3 -m unittest discover -s tests -p 'test_*.py'
bash tests/smoke.sh
```

The smoke test generates a real Allure 3.14.2 HTML report from two synthetic passed results, including one result without `epic` metadata.

## License

MIT. See [LICENSE](LICENSE).
