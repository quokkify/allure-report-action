/**
 * CLI entry point for individual commands
 */
import { runBadges } from './commands/badges.js';
import { runModuleConfig } from './commands/module-config.js';
import { runPrBody } from './commands/pr-body.js';
import { runPrepareResults } from './commands/prepare-results.js';
import { runPyramidCheck } from './commands/pyramid-check.js';
import { runPyramid } from './commands/pyramid.js';

interface CliOptions {
  command: string;
  args: string[];
}

function parseArgs(argv: string[]): CliOptions {
  return {
    command: argv[2] ?? '',
    args: argv.slice(3),
  };
}

function getArg(args: string[], name: string): string {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  return value ?? '';
}

function getFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv);

  try {
    switch (command) {
      case 'prepare-results': {
        const sourceRoot = getArg(args, '--source-root') || '';
        const resultsDir = getArg(args, '--results') || './allure-results';
        const moduleLabel = getArg(args, '--module-label') || 'module';
        const autoMode = getFlag(args, '--auto');
        runPrepareResults({ sourceRoot, resultsDir, moduleLabel, autoMode });
        break;
      }
      case 'module-config': {
        const resultsDir = getArg(args, '--results') || './allure-results';
        const configFile = getArg(args, '--config') || './allurerc.mjs';
        const outputFile = getArg(args, '--output') || './effective-allurerc.mjs';
        const moduleLabel = getArg(args, '--module-label') || 'module';
        await runModuleConfig({ resultsDir, configFile, outputFile, moduleLabel });
        break;
      }
      case 'badges': {
        const resultsDir = getArg(args, '--results') || './allure-results';
        const reportDir = getArg(args, '--out') || './allure-report';
        runBadges({ resultsDir, reportDir });
        break;
      }
      case 'pr-body': {
        const resultsDir = getArg(args, '--results') || './allure-results';
        const reportDir = getArg(args, '--report') || './allure-report';
        const outputFile = getArg(args, '--output') || './allure-pr-comment.md';
        const pagesUrl = getArg(args, '--pages-url') || '';
        const forkPr = getFlag(args, '--fork-pr');
        const sourceRunId = getArg(args, '--source-run-id') || '';
        const actionVersion = getArg(args, '--action-version') || '';
        const commentMarker =
          getArg(args, '--comment-marker') || '<!-- project-toolkit-allure-ci -->';
        runPrBody({
          resultsDir,
          reportDir,
          outputFile,
          pagesUrl,
          forkPr,
          sourceRunId,
          actionVersion,
          commentMarker,
        });
        break;
      }
      case 'pyramid': {
        const resultsDir = getArg(args, '--results') || './allure-results';
        const outputMd = getArg(args, '--output') || './pyramid.md';
        const outputJson = getArg(args, '--json') || '';
        const policyPath = getArg(args, '--policy-path') || undefined;
        const sourceRunId = getArg(args, '--source-run-id') || undefined;
        const headSha = getArg(args, '--head-sha') || undefined;
        runPyramid({ resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha });
        break;
      }
      case 'pyramid-check': {
        const resultsDir = getArg(args, '--results') || './allure-results';
        const outputJson = getArg(args, '--json') || './pyramid-gates.json';
        runPyramidCheck({ resultsDir, outputJson });
        break;
      }
      default:
        console.error('Usage: node cli.cjs <command> [options]');
        console.error(
          'Commands: prepare-results, module-config, badges, pr-body, pyramid, pyramid-check'
        );
        process.exit(1);
    }
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}

main();
