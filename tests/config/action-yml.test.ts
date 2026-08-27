/**
 * Tests for action.yml metadata - ported from Python test_metadata_keeps_pages_optional_and_comments_last
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Action.yml Metadata', () => {
  const actionYmlPath = path.resolve(__dirname, '../../action.yml');
  const actionYml = fs.readFileSync(actionYmlPath, 'utf8');
  const ciWorkflowPath = path.resolve(__dirname, '../../.github/workflows/ci.yml');
  const ciWorkflow = fs.readFileSync(ciWorkflowPath, 'utf8');
  const publisherWorkflowPath = path.resolve(__dirname, '../../.github/workflows/publish.yml');
  const publisherWorkflow = fs.readFileSync(publisherWorkflowPath, 'utf8');

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

  it('executes runtime, Pages publication, then pyramid upload in order', () => {
    const runtimeStep = actionYml.indexOf('run: node "${GITHUB_ACTION_PATH}/dist/index.cjs"');
    const pagesStep = actionYml.indexOf(
      'uses: quokkify/gh-pages-subdir-action@e936122cbdf5a9676b5587d5a812fadf7ddfde6b'
    );
    const uploadStep = actionYml.indexOf(
      'uses: actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a'
    );

    expect(runtimeStep).toBeGreaterThanOrEqual(0);
    expect(pagesStep).toBeGreaterThan(runtimeStep);
    expect(uploadStep).toBeGreaterThan(pagesStep);
  });

  it('keeps pull-request validation read-only', () => {
    expect(ciWorkflow).not.toContain('uses: ./');
    expect(ciWorkflow).not.toContain('secrets.GITHUB_TOKEN');
    expect(ciWorkflow).toContain('contents: read');
    expect(ciWorkflow).not.toContain('contents: write');
    expect(ciWorkflow).not.toContain('pull-requests: write');
  });

  it('publishes only from trusted workflow code and same-repository runs', () => {
    expect(publisherWorkflow).toContain('workflow_run:');
    expect(publisherWorkflow).toContain(
      'github.event.workflow_run.head_repository.full_name == github.repository'
    );
    expect(publisherWorkflow).toContain('github.event.workflow_run.head_repository.fork == false');
    expect(publisherWorkflow).toContain('ref: ${{ github.event.repository.default_branch }}');
    expect(publisherWorkflow).toContain('uses: ./');
    expect(publisherWorkflow).toContain('run-id: ${{ steps.identity.outputs.run_id }}');
    expect(publisherWorkflow).toContain('path: artifacts/raw-allure-results');
    expect(publisherWorkflow).toContain('actions: read');
    expect(publisherWorkflow).toContain('contents: write');
    expect(publisherWorkflow).toContain('pull-requests: write');
    expect(publisherWorkflow).toContain('github.event.workflow_run.head_sha');
    expect(publisherWorkflow).toContain('Expected exactly one open PR');
    expect(publisherWorkflow).toContain('Stale workflow run head SHA');
    expect(publisherWorkflow).toContain('concurrency:');
    expect(publisherWorkflow).toContain('cancel-in-progress: true');
    expect(publisherWorkflow).toContain('sanitize-results');
    expect(publisherWorkflow).toContain('artifacts/sanitized-allure-results');
  });

  it('uploads all pyramid outputs with the configured artifact contract', () => {
    expect(actionYml).toContain(
      'actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a # v7'
    );
    expect(actionYml).toContain("if: ${{ inputs.pyramid-enabled == 'true' }}");
    expect(actionYml).toContain('name: ${{ inputs.pyramid-artifact-name }}');
    expect(actionYml).toContain('${{ inputs.pyramid-markdown-file }}');
    expect(actionYml).toContain('${{ inputs.pyramid-json-file }}');
    expect(actionYml).toContain('${{ inputs.pyramid-gates-json-file }}');
    expect(actionYml).toContain('retention-days: ${{ inputs.pyramid-retention-days }}');
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
