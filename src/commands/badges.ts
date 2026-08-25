/**
 * Badges command
 */
import { generateBadges } from '../allure/badges.js';
import { aggregateResults } from '../allure/parser.js';

export interface BadgesCommandOptions {
  resultsDir: string;
  reportDir: string;
}

/**
 * Executes badges command
 */
export function runBadges(options: BadgesCommandOptions): void {
  const { resultsDir, reportDir } = options;
  const results = aggregateResults(resultsDir);
  generateBadges(results, reportDir);
}
