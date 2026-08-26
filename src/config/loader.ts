/**
 * Configuration loader - reads inputs from GitHub Actions environment
 */
import * as core from '@actions/core';

import { ActionConfig } from './types.js';

/**
 * Loads all action configuration from GitHub Actions inputs
 */
export function loadConfig(): ActionConfig {
  const config: ActionConfig = {
    githubToken: core.getInput('github-token', { required: true }),
    resultsDirectory: core.getInput('results-directory') || 'artifacts/allure-results',
    reportDirectory: core.getInput('report-directory') || 'allure-report',
    configFile: core.getInput('config-file', { required: true }),
    // The action metadata supplies the default when omitted; preserve an
    // explicit empty value because it disables module normalization.
    moduleEnvironmentLabel: core.getInput('module-environment-label'),
    sourceArtifactsDirectory: core.getInput('source-artifacts-directory') || '',
    categoriesFile: core.getInput('categories-file') || '',
    allureVersion: core.getInput('allure-version') || '3.15.0',
    prNumber: core.getInput('pr-number') || '',
    pagesUrl: core.getInput('pages-url') || '',
    forkPr: core.getBooleanInput('fork-pr'),
    sourceRunId: core.getInput('source-run-id') || '',
    commentFile: core.getInput('comment-file') || 'allure-pr-comment.md',
    commentMarker: core.getInput('comment-marker'),
    commentAuthorLogin: core.getInput('comment-author-login') || 'github-actions[bot]',
    pyramidEnabled: core.getBooleanInput('pyramid-enabled'),
    pyramidMarkdownFile:
      core.getInput('pyramid-markdown-file') || 'docs/testing/pyramid-snapshot.md',
    pyramidJsonFile: core.getInput('pyramid-json-file') || 'docs/testing/pyramid-snapshot.json',
    pyramidGatesJsonFile:
      core.getInput('pyramid-gates-json-file') || 'docs/testing/pyramid-quality-gates.json',
    pyramidSourceRunId: core.getInput('pyramid-source-run-id') || '',
    pyramidHeadSha: core.getInput('pyramid-head-sha') || '',
    pyramidPolicyPath: core.getInput('pyramid-policy-path') || '',
    pyramidArtifactName: core.getInput('pyramid-artifact-name') || 'pyramid-snapshot',
    pyramidRetentionDays: parseInt(core.getInput('pyramid-retention-days') || '30', 10),
    publishPages: core.getBooleanInput('publish-pages'),
    pagesDestinationDirectory: core.getInput('pages-destination-directory') || '',
    pagesBranch: core.getInput('pages-branch') || 'gh-pages',
    pagesRetentionCount: parseInt(core.getInput('pages-retention-count') || '0', 10),
  };

  validateConfig(config);
  return config;
}

/**
 * Validates the configuration for required fields and consistency
 */
function validateConfig(config: ActionConfig): void {
  if (!config.commentMarker.trim()) {
    throw new Error('comment-marker must not be empty');
  }

  if (config.publishPages && config.forkPr) {
    core.warning('publish-pages is disabled for fork PRs');
    config.publishPages = false;
  }

  if (config.publishPages && !config.pagesDestinationDirectory.trim()) {
    throw new Error('pages-destination-directory is required when publish-pages is true');
  }
}
