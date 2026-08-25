/**
 * Badges generator - creates shields.io JSON badges for Allure report
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AggregatedResults, TestSummary } from './model.js';

/**
 * Shield JSON structure for shields.io
 */
interface ShieldJson {
  schemaVersion: number;
  label: string;
  message: string;
  color: string;
}

/**
 * Determines badge color based on test statistics
 */
function getColorForStats(stats: TestSummary): string {
  if (stats.failed > 0 || stats.broken > 0) return 'red';
  if (stats.skipped > 0 && stats.passed + stats.failed + stats.broken === 0) return 'yellow';
  if (stats.passed > 0) return 'brightgreen';
  return 'lightgrey';
}

/**
 * Generates badge message from test statistics
 */
function getMessageForStats(stats: TestSummary): string {
  if (stats.total === 0) return 'no tests';
  const parts: string[] = [];
  if (stats.passed) parts.push(`${stats.passed} passed`);
  if (stats.failed) parts.push(`${stats.failed} failed`);
  if (stats.broken) parts.push(`${stats.broken} broken`);
  if (stats.skipped) parts.push(`${stats.skipped} skipped`);
  if (stats.unknown) parts.push(`${stats.unknown} other`);
  return parts.join(', ') || `${stats.total} total`;
}

/**
 * Creates shield JSON object
 */
function createShieldJson(label: string, stats: TestSummary): ShieldJson {
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
export function generateBadges(results: AggregatedResults, reportDir: string): void {
  const badgeDir = path.join(reportDir, 'badges');
  fs.mkdirSync(badgeDir, { recursive: true });

  // Total badge
  const totalBadge = createShieldJson('all tests', results.total);
  fs.writeFileSync(path.join(badgeDir, 'total.json'), JSON.stringify(totalBadge, null, 0));

  // Epic badges
  const epics: (keyof typeof results.byEpic)[] = ['unit', 'api', 'ui', 'end-to-end', 'other'];
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
