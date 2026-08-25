/**
 * Badges command
 */
import { generateBadges } from '../allure/badges.js';
import { aggregateResults, listResultFiles, readJsonSafe, getEpicForResult, } from '../report/index.js';
/**
 * Executes badges command
 */
export function runBadges(options) {
    const { resultsDir, reportDir } = options;
    const results = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), getEpicForResult);
    generateBadges(results, reportDir);
}
//# sourceMappingURL=badges.js.map