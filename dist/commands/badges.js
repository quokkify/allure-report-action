/**
 * Badges command
 */
import { generateBadges } from '../allure/badges.js';
import { aggregateResults } from '../allure/parser.js';
/**
 * Executes badges command
 */
export function runBadges(options) {
    const { resultsDir, reportDir } = options;
    const results = aggregateResults(resultsDir);
    generateBadges(results, reportDir);
}
//# sourceMappingURL=badges.js.map