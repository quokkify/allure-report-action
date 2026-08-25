/**
 * Tests for action.yml metadata - ported from Python test_metadata_keeps_pages_optional_and_comments_last
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Action.yml Metadata', () => {
  const actionYmlPath = path.resolve(__dirname, '../../action.yml');
  const actionYml = fs.readFileSync(actionYmlPath, 'utf8');

  it('uses node20 runner instead of composite', () => {
    expect(actionYml).toContain('runs:\n  using: node20');
    expect(actionYml).toContain('main: dist/index.js');
    expect(actionYml).not.toContain('using: composite');
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

  it('has source-artifacts-directory default empty', () => {
    expect(actionYml).toMatch(/source-artifacts-directory:.*?default: ""/s);
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
