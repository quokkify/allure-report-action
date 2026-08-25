/**
 * Main entry point for the GitHub Action
 */
import * as core from '@actions/core';

import { setActionVersion, ACTION_VERSION } from './allure/model.js';
import { runBadges } from './commands/badges.js';
import { runModuleConfig } from './commands/module-config.js';
import { runPrBody } from './commands/pr-body.js';
import { runPrepareResults } from './commands/prepare-results.js';
import { runPyramidCheck } from './commands/pyramid-check.js';
import { runPyramid } from './commands/pyramid.js';
import { loadConfig } from './config/loader.js';
import { publishPrComment } from './github/comment-publisher.js';
import { readFile } from './utils/fs.js';
import { readFile as readVersionFile } from './utils/fs.js';

async function run(): Promise<void> {
  try {
    // Load action version
    try {
      const version = readVersionFile('version.txt').trim();
      setActionVersion(version);
    } catch {
      // version.txt might not be available in development
    }

    const config = loadConfig();

    // Step 1: Prepare attributed results if source artifacts directory is provided
    if (config.sourceArtifactsDirectory) {
      let sourceRoot = config.sourceArtifactsDirectory;
      let autoMode = false;
      if (sourceRoot === 'auto') {
        const path = await import('node:path');
        sourceRoot = path.dirname(config.resultsDirectory);
        autoMode = true;
      }
      runPrepareResults({
        sourceRoot,
        resultsDir: config.resultsDirectory,
        moduleLabel: config.moduleEnvironmentLabel,
        autoMode,
      });
    }

    // Step 2: Copy categories file if provided
    if (config.categoriesFile) {
      const fs = await import('node:fs');
      const path = await import('node:path');
      fs.cpSync(config.categoriesFile, path.join(config.resultsDirectory, 'categories.json'), {
        force: true,
      });
    }

    // Step 3: Generate module config if module label is provided
    let effectiveConfigFile = config.configFile;
    if (config.moduleEnvironmentLabel) {
      const tmp = await import('node:os');
      const path = await import('node:path');
      effectiveConfigFile = path.join(
        tmp.tmpdir(),
        `allure-report-action-config-${Date.now()}.mjs`
      );
      await runModuleConfig({
        resultsDir: config.resultsDirectory,
        configFile: config.configFile,
        outputFile: effectiveConfigFile,
        moduleLabel: config.moduleEnvironmentLabel,
      });
    }

    // Step 4: Run Allure generate using the effective config file
    const { spawnSync } = await import('node:child_process');
    const allureGenerate = spawnSync(
      'npx',
      [
        '--yes',
        `allure@${config.allureVersion}`,
        'generate',
        config.resultsDirectory,
        '-o',
        config.reportDirectory,
        '--config',
        effectiveConfigFile,
      ],
      { stdio: 'inherit', shell: true }
    );
    if (allureGenerate.status !== 0) {
      throw new Error(`Allure generate failed with exit code ${allureGenerate.status}`);
    }

    // Step 5: Generate badges
    runBadges({
      resultsDir: config.resultsDirectory,
      reportDir: config.reportDirectory,
    });

    // Step 6: Generate PR comment
    runPrBody({
      resultsDir: config.resultsDirectory,
      reportDir: config.reportDirectory,
      outputFile: config.commentFile,
      pagesUrl: config.pagesUrl,
      forkPr: config.forkPr,
      sourceRunId: config.sourceRunId,
      actionVersion: ACTION_VERSION,
      commentMarker: config.commentMarker,
    });

    // Step 7: Generate pyramid if enabled
    if (config.pyramidEnabled) {
      runPyramid({
        resultsDir: config.resultsDirectory,
        outputMd: config.pyramidMarkdownFile,
        outputJson: config.pyramidJsonFile,
        policyPath: config.pyramidPolicyPath || undefined,
        sourceRunId: config.pyramidSourceRunId || undefined,
        headSha: config.pyramidHeadSha || undefined,
      });

      runPyramidCheck({
        resultsDir: config.resultsDirectory,
        outputJson: config.pyramidGatesJsonFile,
      });
    }

    // Step 8: Publish PR comment if PR number is provided
    if (config.prNumber) {
      const prNumber = parseInt(config.prNumber, 10);
      if (!isNaN(prNumber)) {
        const commentBody = readFile(config.commentFile);
        await publishPrComment({
          githubToken: config.githubToken,
          prNumber,
          commentMarker: config.commentMarker,
          commentAuthorLogin: config.commentAuthorLogin,
          body: commentBody,
        });
      }
    }

    // Set outputs
    core.setOutput('report-directory', config.reportDirectory);
    core.setOutput('comment-file', config.commentFile);
  } catch (error) {
    core.setFailed((error as Error).message);
  }
}

run();
