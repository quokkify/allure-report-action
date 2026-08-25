/**
 * Allure result parser - reads and processes Allure result JSON files
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  AllureResult,
  AllureLabel,
  AggregatedResults,
  TestSummary,
  EpicType,
  PYRAMID_LAYERS,
  LayerSummary,
} from './model.js';

/**
 * Lists all Allure result files in a directory
 */
export function listResultFiles(resultsDir: string): string[] {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('-result.json'))
    .map(entry => path.join(resultsDir, entry.name));
}

/**
 * Safely reads and parses a JSON file
 */
export function readJsonSafe<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Extracts a label value from Allure labels array
 */
export function getLabelValue(labels: AllureLabel[] | undefined, name: string): string {
  if (!Array.isArray(labels)) return '';
  const label = labels.find(item => item && item.name === name && item.value);
  return label ? String(label.value).trim() : '';
}

/**
 * Determines the epic type for a test result
 */
export function getEpicForResult(result: AllureResult): EpicType {
  const rawEpic = getLabelValue(result.labels, 'epic');
  if (
    rawEpic &&
    (['unit', 'api', 'ui', 'end-to-end'] as EpicType[]).includes(rawEpic as EpicType)
  ) {
    return rawEpic as EpicType;
  }
  if (!Array.isArray(result.labels)) return 'other';
  const framework = result.labels.find(l => l && l.name === 'framework');
  if (framework && String(framework.value).toLowerCase() === 'playwright') {
    return 'end-to-end';
  }
  return 'other';
}

/**
 * Creates an empty test summary
 */
function emptySummary(): TestSummary {
  return { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
}

/**
 * Aggregates test results by epic type
 */
export function aggregateResults(resultsDir: string): AggregatedResults {
  const files = listResultFiles(resultsDir);
  const byEpic: Record<EpicType, TestSummary> = {
    unit: emptySummary(),
    api: emptySummary(),
    ui: emptySummary(),
    'end-to-end': emptySummary(),
    other: emptySummary(),
  };
  const total = emptySummary();

  for (const file of files) {
    const result = readJsonSafe<AllureResult>(file);
    if (!result || typeof result.status !== 'string') continue;

    const status = result.status.toLowerCase();
    const epic = getEpicForResult(result);
    const bucket = byEpic[epic];

    bucket.total++;
    total.total++;

    switch (status) {
      case 'passed':
        bucket.passed++;
        total.passed++;
        break;
      case 'failed':
        bucket.failed++;
        total.failed++;
        break;
      case 'broken':
        bucket.broken++;
        total.broken++;
        break;
      case 'skipped':
        bucket.skipped++;
        total.skipped++;
        break;
      default:
        bucket.unknown++;
        total.unknown++;
    }
  }

  // Compute pyramid layers
  const layers: LayerSummary[] = PYRAMID_LAYERS.map(layerDef => ({
    id: layerDef.id,
    label: layerDef.label,
    epics: [...layerDef.epics] as EpicType[],
    stats: sumEpicStats([...layerDef.epics] as EpicType[], byEpic),
  }));

  const pyramidTotal = layers.reduce((sum, layer) => sum + layer.stats.total, 0);
  const unitStats = layers.find(l => l.id === 'unit')?.stats ?? emptySummary();
  const apiStats = layers.find(l => l.id === 'api')?.stats ?? emptySummary();
  const e2eLayer = layers.find(l => l.id === 'ui_e2e');
  const e2eStats = e2eLayer?.stats ?? emptySummary();

  const other = byEpic.other;
  const otherEpicTotal = other.total;

  return {
    byEpic,
    total,
    resultCount: files.length,
    layers,
    otherEpicTotal,
    pyramidTotal,
    unitShare: pyramidTotal ? unitStats.total / pyramidTotal : 0,
    apiShare: pyramidTotal ? apiStats.total / pyramidTotal : 0,
    e2eShare: pyramidTotal ? e2eStats.total / pyramidTotal : 0,
  };
}

/**
 * Sums test summaries for a list of epic types
 */
function sumEpicStats(epics: EpicType[], byEpic: Record<EpicType, TestSummary>): TestSummary {
  const sum = emptySummary();
  for (const epic of epics) {
    const stats = byEpic[epic];
    sum.passed += stats.passed;
    sum.failed += stats.failed;
    sum.broken += stats.broken;
    sum.skipped += stats.skipped;
    sum.unknown += stats.unknown;
    sum.total += stats.total;
  }
  return sum;
}

/**
 * Reads the widget summary from generated Allure report
 */
export function readWidgetSummary(reportDir: string): { statistic?: TestSummary } | null {
  return readJsonSafe(path.join(reportDir, 'widgets', 'summary.json'));
}

/**
 * Calculates pass rate percentage
 */
export function calculatePassRate(passed: number, total: number): string {
  if (!total) return '—';
  const pct = (100 * passed) / total;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}
