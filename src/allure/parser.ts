/**
 * Allure result parser - reads and processes Allure result JSON files
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AllureLabel, EpicType } from './model.js';

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
export function getEpicForResult(result: { labels?: { name: string; value: string }[] }): EpicType {
  const rawEpic = getLabelValue(result.labels, 'epic');
  if (
    rawEpic &&
    (['unit', 'api', 'ui', 'end-to-end'] as EpicType[]).includes(rawEpic as EpicType)
  ) {
    return rawEpic as EpicType;
  }
  if (!Array.isArray(result.labels)) return 'other';
  const framework = result.labels?.find(l => l && l.name === 'framework');
  if (framework && String(framework.value).toLowerCase() === 'playwright') {
    return 'end-to-end';
  }
  return 'other';
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
