/**
 * Tests for action.yml metadata - ported from Python test_metadata_keeps_pages_optional_and_comments_last
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Action.yml Metadata', () => {
  const actionYmlPath = path.resolve(__dirname, '../../action.yml');
  const actionYml = fs.readFileSync(actionYmlPath, 'utf8');

  it('delegates runtime and Pages publication through composite steps', () => {
    expect(actionYml).toContain('using: composite');
    expect(actionYml).toContain('run: node "${GITHUB_ACTION_PATH}/dist/index.cjs"');
    expect(actionYml).toContain(
      'quokkify/gh-pages-subdir-action@e936122cbdf5a9676b5587d5a812fadf7ddfde6b # v0.1.1'
    );
    expect(actionYml).toContain(
      "if: ${{ inputs.publish-pages == 'true' && inputs.fork-pr != 'true' }}"
    );
    expect(actionYml).not.toContain('using: node24');
  });

  it('forwards every runtime input through INPUT_* environment variables', () => {
    for (const input of [
      'github-token',
      'results-directory',
      'report-directory',
      'config-file',
      'module-environment-label',
      'source-artifacts-directory',
      'categories-file',
      'allure-version',
      'pr-number',
      'pages-url',
      'fork-pr',
      'source-run-id',
      'comment-file',
      'comment-marker',
      'comment-author-login',
      'pyramid-enabled',
      'pyramid-markdown-file',
      'pyramid-json-file',
      'pyramid-gates-json-file',
      'pyramid-source-run-id',
      'pyramid-head-sha',
      'pyramid-policy-path',
      'pyramid-artifact-name',
      'pyramid-retention-days',
      'publish-pages',
      'pages-destination-directory',
      'pages-branch',
      'pages-retention-count',
    ]) {
      expect(actionYml).toContain(`INPUT_${input.toUpperCase()}: \${{ inputs.${input} }}`);
    }
  });

  it('has required github-token input', () => {
    expect(actionYml).toMatch(/github-token:\n\s+description:.*\n\s+required: true/);
  });

  it('has publish-pages default false', () => {
    expect(actionYml).toMatch(/publish-pages:.*?default: "false"/s);
  });

  it('has pyramid-enabled default false', () => {
    expect(actionYml).toMatch(/pyramid-enabled:.*?default: "false"/s);
  });

  it('has pyramid-policy-path default empty', () => {
    expect(actionYml).toMatch(/pyramid-policy-path:.*?default: ""/s);
  });

  it('has comment-marker default', () => {
    expect(actionYml).toContain('default: "<!-- project-toolkit-allure-ci -->"');
  });

  it('has module-environment-label default module', () => {
    expect(actionYml).toMatch(/module-environment-label:.*?default: "module"/s);
  });

  it('has source-artifacts-directory default auto', () => {
    expect(actionYml).toMatch(/source-artifacts-directory:.*?default: "auto"/s);
  });

  it('has github-token input required', () => {
    expect(actionYml).toMatch(/github-token:[\s\S]*?required: true/);
  });

  it('does not contain legacy composite step references', () => {
    expect(actionYml).not.toContain('allure-ci.mjs');
    expect(actionYml).not.toContain('actions/github-script');
    expect(actionYml).not.toContain('api.github.com');
  });

  it('does not use hardcoded github-actions[bot] for comment author', () => {
    expect(actionYml).not.toContain("c.user?.login === 'github-actions[bot]'");
  });

  it('does not use simple marker find without author check', () => {
    expect(actionYml).not.toContain(
      "const existing = comments.find((c) => (c.body || '').includes(marker));"
    );
  });

  it('does not use GET /installation request', () => {
    expect(actionYml).not.toContain("github.request('GET /installation')");
  });
});
