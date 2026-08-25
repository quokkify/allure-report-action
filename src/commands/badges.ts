/**
 * Badges command
 */
import { generateBadges } from '../allure/badges.js';
import {
  aggregateResults,
  listResultFiles,
  readJsonSafe,
  getEpicForResult,
} from '../report/index.js';

export interface BadgesCommandOptions {
  resultsDir: string;
  reportDir: string;
}

/**
 * Executes badges command
 */
export function runBadges(options: BadgesCommandOptions): void {
  const { resultsDir, reportDir } = options;
  const results = aggregateResults(
    listResultFiles(resultsDir),
    (file: string) => readJsonSafe(file),
    getEpicForResult
  );
  generateBadges(results, reportDir);
}
