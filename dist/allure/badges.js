/**
 * Badges generator - creates shields.io JSON badges for Allure report
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
/**
 * Determines badge color based on test statistics
 */
function getColorForStats(stats) {
    if (stats.failed > 0 || stats.broken > 0)
        return 'red';
    if (stats.skipped > 0 && stats.passed + stats.failed + stats.broken === 0)
        return 'yellow';
    if (stats.passed > 0)
        return 'brightgreen';
    return 'lightgrey';
}
/**
 * Generates badge message from test statistics
 */
function getMessageForStats(stats) {
    if (stats.total === 0)
        return 'no tests';
    const parts = [];
    if (stats.passed)
        parts.push(`${stats.passed} passed`);
    if (stats.failed)
        parts.push(`${stats.failed} failed`);
    if (stats.broken)
        parts.push(`${stats.broken} broken`);
    if (stats.skipped)
        parts.push(`${stats.skipped} skipped`);
    if (stats.unknown)
        parts.push(`${stats.unknown} other`);
    return parts.join(', ') || `${stats.total} total`;
}
/**
 * Creates shield JSON object
 */
function createShieldJson(label, stats) {
    return {
        schemaVersion: 1,
        label,
        message: getMessageForStats(stats),
        color: getColorForStats(stats),
    };
}
/**
 * Generates badges for total and each epic
 */
export function generateBadges(results, reportDir) {
    const badgeDir = path.join(reportDir, 'badges');
    fs.mkdirSync(badgeDir, { recursive: true });
    // Total badge
    const totalBadge = createShieldJson('all tests', results.total);
    fs.writeFileSync(path.join(badgeDir, 'total.json'), JSON.stringify(totalBadge, null, 0));
    // Epic badges
    const epics = ['unit', 'api', 'ui', 'end-to-end', 'other'];
    for (const epic of epics) {
        const stats = results.byEpic[epic] || {
            total: 0,
            passed: 0,
            failed: 0,
            broken: 0,
            skipped: 0,
            unknown: 0,
        };
        const badge = createShieldJson(`${epic} tests`, stats);
        fs.writeFileSync(path.join(badgeDir, `${epic}.json`), JSON.stringify(badge, null, 0));
    }
}
//# sourceMappingURL=badges.js.map