/**
 * Main entry point for the GitHub Action
 */
import * as core from '@actions/core';
import { runBadges } from './commands/badges.js';
import { runModuleConfig } from './commands/module-config.js';
import { runPrBody } from './commands/pr-body.js';
import { runPrepareResults } from './commands/prepare-results.js';
import { runPyramidCheck } from './commands/pyramid-check.js';
import { runPyramid } from './commands/pyramid.js';
import { loadConfig } from './config/loader.js';
import { publishPrComment } from './github/comment-publisher.js';
import { setActionVersion, ACTION_VERSION } from './report/model.js';
import { readFile } from './utils/fs.js';
import { readFile as readVersionFile } from './utils/fs.js';
async function run() {
    try {
        // Load action version
        try {
            const version = readVersionFile('version.txt').trim();
            setActionVersion(version);
        }
        catch {
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
            effectiveConfigFile = path.join(tmp.tmpdir(), `allure-report-action-config-${Date.now()}.mjs`);
            await runModuleConfig({
                resultsDir: config.resultsDirectory,
                configFile: config.configFile,
                outputFile: effectiveConfigFile,
                moduleLabel: config.moduleEnvironmentLabel,
            });
        }
        // Step 4: Run Allure generate using the effective config file
        const { spawnSync } = await import('node:child_process');
        const isWin = process.platform === 'win32';
        const npxCmd = isWin ? 'npx.cmd' : 'npx';
        const allureGenerate = spawnSync(npxCmd, [
            '--yes',
            `allure@${config.allureVersion}`,
            'generate',
            config.resultsDirectory,
            '-o',
            config.reportDirectory,
            '--config',
            effectiveConfigFile,
        ], { stdio: 'inherit' });
        if (allureGenerate.status !== 0) {
            throw new Error(`Allure generate failed with exit code ${allureGenerate.status}`);
        }
        // Step 5: Generate badges
        runBadges({
            resultsDir: config.resultsDirectory,
            reportDir: config.reportDirectory,
        });
        // Step 6: Generate PR comment
        await runPrBody({
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
        // Step 9: Deploy to GitHub Pages when publish-pages is enabled
        if (config.publishPages) {
            try {
                const repoFull = process.env.GITHUB_REPOSITORY;
                if (!repoFull) {
                    throw new Error('GITHUB_REPOSITORY environment variable not set');
                }
                const [owner, repo] = repoFull.split('/');
                const pagesBranch = config.pagesBranch;
                const destinationDir = config.pagesDestinationDirectory;
                const retentionCount = config.pagesRetentionCount;
                // Create a temporary directory for the gh-pages deployment
                const tmp = await import('node:os');
                const path = await import('node:path');
                const fs = await import('node:fs');
                const { spawnSync } = await import('node:child_process');
                const deployDir = path.join(tmp.tmpdir(), `gh-pages-deploy-${Date.now()}`);
                fs.mkdirSync(deployDir, { recursive: true });
                // Copy report to deploy directory
                fs.cpSync(config.reportDirectory, path.join(deployDir, destinationDir), {
                    recursive: true,
                });
                // Initialize git repo and push to gh-pages
                process.chdir(deployDir);
                spawnSync('git', ['init'], { stdio: 'inherit' });
                spawnSync('git', ['config', 'user.name', 'github-actions[bot]'], { stdio: 'inherit' });
                spawnSync('git', ['config', 'user.email', 'github-actions[bot]@users.noreply.github.com'], {
                    stdio: 'inherit',
                });
                spawnSync('git', ['checkout', '-b', pagesBranch], { stdio: 'inherit' });
                spawnSync('git', ['add', '.'], { stdio: 'inherit' });
                spawnSync('git', ['commit', '-m', `Deploy Allure report for PR #${config.prNumber}`], {
                    stdio: 'inherit',
                });
                // Push to gh-pages with force
                const pushUrl = `https://x-access-token:${config.githubToken}@github.com/${repoFull}.git`;
                const pushResult = spawnSync('git', ['push', '--force', pushUrl, pagesBranch], {
                    stdio: 'inherit',
                });
                if (pushResult.status !== 0) {
                    throw new Error('Failed to push to gh-pages branch');
                }
                // Retention pruning - list all pr-* directories and keep only N newest
                if (retentionCount > 0) {
                    try {
                        const listResult = spawnSync('git', ['ls-tree', '-d', '-r', '--name-only', pagesBranch], {
                            stdio: 'pipe',
                            encoding: 'utf8',
                        });
                        if (listResult.status === 0) {
                            const dirs = listResult.stdout
                                .trim()
                                .split('\n')
                                .filter(d => d.startsWith('allure-report-pr-'))
                                .sort((a, b) => {
                                const aNum = parseInt(a.replace('allure-report-pr-', ''), 10);
                                const bNum = parseInt(b.replace('allure-report-pr-', ''), 10);
                                return bNum - aNum; // newest first
                            });
                            if (dirs.length > retentionCount) {
                                const toDelete = dirs.slice(retentionCount);
                                for (const dir of toDelete) {
                                    spawnSync('git', ['rm', '-rf', dir], { stdio: 'inherit', cwd: deployDir });
                                }
                                if (toDelete.length > 0) {
                                    spawnSync('git', ['commit', '-m', `Prune old PR reports (keep ${retentionCount})`], { stdio: 'inherit', cwd: deployDir });
                                    spawnSync('git', ['push', '--force', pushUrl, pagesBranch], {
                                        stdio: 'inherit',
                                        cwd: deployDir,
                                    });
                                }
                            }
                        }
                    }
                    catch (e) {
                        core.warning(`Retention pruning failed: ${e.message}`);
                    }
                }
                const pagesUrl = `https://${owner}.github.io/${repo}/${destinationDir}/`;
                core.info(`Published Allure report to GitHub Pages: ${pagesUrl}`);
            }
            catch (error) {
                core.setFailed(`GitHub Pages deployment failed: ${error.message}`);
                throw error;
            }
        }
        // Set outputs
        core.setOutput('report-directory', config.reportDirectory);
        core.setOutput('comment-file', config.commentFile);
    }
    catch (error) {
        core.setFailed(error.message);
    }
}
run();
//# sourceMappingURL=main.js.map