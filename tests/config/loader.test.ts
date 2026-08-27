/**
 * Tests for config loader
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { getInputMock, getBooleanInputMock, warningMock } = vi.hoisted(() => ({
  getInputMock: vi.fn(),
  getBooleanInputMock: vi.fn(),
  warningMock: vi.fn(),
}));

vi.mock('@actions/core', () => ({
  getInput: getInputMock,
  getBooleanInput: getBooleanInputMock,
  warning: warningMock,
}));

import * as core from '@actions/core';
import { loadConfig } from '../../src/config/loader.js';

describe('Config Loader', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const setupDefaultMocks = () => {
    getInputMock.mockImplementation((name: string) => {
      const defaults: Record<string, string> = {
        'github-token': 'test-token',
        'results-directory': 'artifacts/allure-results',
        'report-directory': 'allure-report',
        'config-file': 'allurerc.mjs',
        'module-environment-label': 'module',
        'source-artifacts-directory': '',
        'categories-file': '',
        'allure-version': '3.15.0',
        'pr-number': '',
        'pages-url': '',
        'fork-pr': 'false',
        'source-run-id': '',
        'comment-file': 'allure-pr-comment.md',
        'comment-marker': '<!-- project-toolkit-allure-ci -->',
        'comment-author-login': 'github-actions[bot]',
        'pyramid-enabled': 'false',
        'pyramid-markdown-file': 'docs/testing/pyramid-snapshot.md',
        'pyramid-json-file': 'docs/testing/pyramid-snapshot.json',
        'pyramid-gates-json-file': 'docs/testing/pyramid-quality-gates.json',
        'pyramid-source-run-id': '',
        'pyramid-head-sha': '',
        'pyramid-policy-path': '',
        'pyramid-artifact-name': 'pyramid-snapshot',
        'pyramid-retention-days': '30',
        'publish-pages': 'false',
        'pages-destination-directory': '',
        'pages-branch': 'gh-pages',
        'pages-retention-count': '0',
      };
      return defaults[name] || '';
    });
    getBooleanInputMock.mockImplementation((name: string) => {
      const booleans: Record<string, boolean> = {
        'fork-pr': false,
        'pyramid-enabled': false,
        'publish-pages': false,
      };
      return booleans[name] ?? false;
    });
    warningMock.mockImplementation(() => {});
  };

  it('loads all required and optional inputs with defaults', () => {
    setupDefaultMocks();
    const config = loadConfig();

    expect(config.githubToken).toBe('test-token');
    expect(config.resultsDirectory).toBe('artifacts/allure-results');
    expect(config.reportDirectory).toBe('allure-report');
    expect(config.configFile).toBe('allurerc.mjs');
    expect(config.moduleEnvironmentLabel).toBe('module');
    expect(config.sourceArtifactsDirectory).toBe('');
    expect(config.categoriesFile).toBe('');
    expect(config.allureVersion).toBe('3.15.0');
    expect(config.prNumber).toBe('');
    expect(config.pagesUrl).toBe('');
    expect(config.forkPr).toBe(false);
    expect(config.sourceRunId).toBe('');
    expect(config.commentFile).toBe('allure-pr-comment.md');
    expect(config.commentMarker).toBe('<!-- project-toolkit-allure-ci -->');
    expect(config.commentAuthorLogin).toBe('github-actions[bot]');
    expect(config.pyramidEnabled).toBe(false);
    expect(config.pyramidMarkdownFile).toBe('docs/testing/pyramid-snapshot.md');
    expect(config.pyramidJsonFile).toBe('docs/testing/pyramid-snapshot.json');
    expect(config.pyramidGatesJsonFile).toBe('docs/testing/pyramid-quality-gates.json');
    expect(config.pyramidSourceRunId).toBe('');
    expect(config.pyramidHeadSha).toBe('');
    expect(config.pyramidPolicyPath).toBe('');
    expect(config.pyramidArtifactName).toBe('pyramid-snapshot');
    expect(config.pyramidRetentionDays).toBe(30);
    expect(config.publishPages).toBe(false);
    expect(config.pagesDestinationDirectory).toBe('');
    expect(config.pagesBranch).toBe('gh-pages');
    expect(config.pagesRetentionCount).toBe(0);
  });

  it('preserves an explicit empty module label to disable normalization', () => {
    setupDefaultMocks();
    getInputMock.mockImplementation((name: string) => {
      if (name === 'module-environment-label') return '';
      return 'default';
    });

    const config = loadConfig();

    expect(config.moduleEnvironmentLabel).toBe('');
  });

  it('parses boolean inputs correctly', () => {
    setupDefaultMocks();
    getBooleanInputMock.mockImplementation((name: string) => {
      if (name === 'fork-pr') return true;
      if (name === 'pyramid-enabled') return true;
      if (name === 'publish-pages') return true;
      return false;
    });

    const config = loadConfig();

    expect(config.forkPr).toBe(true);
    expect(config.pyramidEnabled).toBe(true);
    // publishPages is disabled when forkPr is true (validation logic)
    expect(config.publishPages).toBe(false);
  });
  it('parses numeric inputs correctly', () => {
    setupDefaultMocks();
    getInputMock.mockImplementation((name: string) => {
      if (name === 'allure-version') return '3.20.1';
      if (name === 'pyramid-retention-days') return '60';
      if (name === 'pages-retention-count') return '10';
      return 'default';
    });

    const config = loadConfig();

    expect(config.allureVersion).toBe('3.20.1');
    expect(config.pyramidRetentionDays).toBe(60);
    expect(config.pagesRetentionCount).toBe(10);
  });

  it('throws error for empty comment marker', () => {
    setupDefaultMocks();
    getInputMock.mockImplementation((name: string) => {
      if (name === 'comment-marker') return '';
      return 'default';
    });

    expect(() => loadConfig()).toThrow('comment-marker must not be empty');
  });

  it('throws error for missing pages destination when publish-pages is true', () => {
    setupDefaultMocks();
    getBooleanInputMock.mockImplementation((name: string) => {
      if (name === 'publish-pages') return true;
      return false;
    });
    getInputMock.mockImplementation((name: string) => {
      if (name === 'pages-destination-directory') return '';
      return 'default';
    });

    expect(() => loadConfig()).toThrow(
      'pages-destination-directory is required when publish-pages is true'
    );
  });

  it('warns when publish-pages is true for fork PR and disables it', () => {
    setupDefaultMocks();
    getBooleanInputMock.mockImplementation((name: string) => {
      if (name === 'publish-pages') return true;
      if (name === 'fork-pr') return true;
      return false;
    });
    getInputMock.mockImplementation((name: string) => {
      if (name === 'pages-destination-directory') return 'allure/pr-1';
      return 'default';
    });

    const config = loadConfig();

    expect(warningMock).toHaveBeenCalledWith('publish-pages is disabled for fork PRs');
    expect(config.publishPages).toBe(false);
  });
});
