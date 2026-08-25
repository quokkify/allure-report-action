/**
 * Tests for config loader
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
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
    vi.spyOn(core, 'getBooleanInput').mockImplementation((name: string) => {
      const booleans: Record<string, boolean> = {
        'fork-pr': false,
        'pyramid-enabled': false,
        'publish-pages': false,
      };
      return booleans[name] ?? false;
    });
    vi.spyOn(core, 'warning').mockImplementation(() => {});
  };

  it('loads all required and optional inputs with defaults', () => {
    setupDefaultMocks();
    const config = loadConfig();

    expect(config.githubToken).toBe('test-token');
    expect(config.resultsDirectory).toBe('artifacts/allure-results');
    expect(config.reportDirectory).toBe('allure-report');
    expect(config.configFile).toBe('allurerc.mjs');
    expect(config.moduleEnvironmentLabel).toBe('module');
    expect(config.allureVersion).toBe('3.15.0');
    expect(config.commentMarker).toBe('<!-- project-toolkit-allure-ci -->');
    expect(config.commentAuthorLogin).toBe('github-actions[bot]');
  });

  it('parses boolean inputs correctly', () => {
    setupDefaultMocks();
    vi.spyOn(core, 'getBooleanInput').mockImplementation((name: string) => {
      if (name === 'fork-pr') return true;
      if (name === 'pyramid-enabled') return true;
      // publish-pages is false to test boolean parsing without fork PR interaction
      if (name === 'publish-pages') return false;
      return false;
    });
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'pages-destination-directory') return 'allure/pr-1';
      return 'default';
    });

    const config = loadConfig();

    expect(config.forkPr).toBe(true);
    expect(config.pyramidEnabled).toBe(true);
    expect(config.publishPages).toBe(false);
  });

  it('parses numeric inputs correctly', () => {
    setupDefaultMocks();
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'pyramid-retention-days') return '14';
      if (name === 'pages-retention-count') return '5';
      return 'default';
    });

    const config = loadConfig();

    expect(config.pyramidRetentionDays).toBe(14);
    expect(config.pagesRetentionCount).toBe(5);
  });

  it('throws error for empty comment marker', () => {
    vi.restoreAllMocks();
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
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
        'comment-marker': '',
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
      return defaults[name];
    });
    vi.spyOn(core, 'getBooleanInput').mockImplementation(() => false);
    vi.spyOn(core, 'warning').mockImplementation(() => {});

    expect(() => loadConfig()).toThrow('comment-marker must not be empty');
  });

  it('throws error for missing pages destination when publish-pages is true', () => {
    setupDefaultMocks();
    vi.spyOn(core, 'getBooleanInput').mockImplementation(
      (name: string) => name === 'publish-pages'
    );
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'pages-destination-directory') return '';
      return 'default';
    });

    expect(() => loadConfig()).toThrow(
      'pages-destination-directory is required when publish-pages is true'
    );
  });

  it('warns when publish-pages is true for fork PR and disables it', () => {
    setupDefaultMocks();
    vi.spyOn(core, 'getBooleanInput').mockImplementation((name: string) => {
      if (name === 'publish-pages') return true;
      if (name === 'fork-pr') return true;
      return false;
    });
    vi.spyOn(core, 'getInput').mockImplementation((name: string) => {
      if (name === 'pages-destination-directory') return 'allure/pr-1';
      return 'default';
    });

    const config = loadConfig();

    expect(core.warning).toHaveBeenCalledWith('publish-pages is disabled for fork PRs');
    expect(config.publishPages).toBe(false);
  });
});
