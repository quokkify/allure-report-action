/**
 * Prepare results command
 */
import { prepareAttributedResults } from '../allure/prepare-results.js';

export interface PrepareResultsCommandOptions {
  sourceRoot: string;
  resultsDir: string;
  moduleLabel: string;
  autoMode: boolean;
}

/**
 * Executes prepare-results command
 */
export function runPrepareResults(options: PrepareResultsCommandOptions): void {
  prepareAttributedResults(options);
}
