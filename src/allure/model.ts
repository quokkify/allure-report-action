/**
 * Allure domain models - core types for representing Allure report data
 */

/**
 * Test status values from Allure results
 */
export type TestStatus = 'passed' | 'failed' | 'broken' | 'skipped' | 'unknown';

/**
 * Known epic types for test pyramid classification
 */
export type EpicType = 'unit' | 'api' | 'ui' | 'end-to-end' | 'other';

/**
 * Summary statistics for a group of tests
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  broken: number;
  skipped: number;
  unknown: number;
}

/**
 * Layer summary for test pyramid (contains TestSummary stats)
 */
export interface LayerSummary {
  id: string;
  label: string;
  epics: EpicType[];
  stats: TestSummary;
}

/**
 * Complete aggregated results from Allure results directory
 */
export interface AggregatedResults {
  byEpic: Record<EpicType, TestSummary>;
  total: TestSummary;
  resultCount: number;
  layers: LayerSummary[];
  otherEpicTotal: number;
  pyramidTotal: number;
  unitShare: number;
  apiShare: number;
  e2eShare: number;
}

/**
 * Represents a single Allure result file
 */
export interface AllureResult {
  uuid: string;
  name: string;
  status: string;
  stage?: string;
  start?: number;
  stop?: number;
  labels?: AllureLabel[];
}

/**
 * Allure label from result JSON
 */
export interface AllureLabel {
  name: string;
  value: string;
}

/**
 * Test pyramid layers definition
 */
export const PYRAMID_LAYERS = [
  { id: 'unit', epics: ['unit'], label: 'Unit (base)', epicNote: '`unit`' },
  {
    id: 'api',
    epics: ['api'],
    label: 'Integration (middle)',
    epicNote: '`epic: api`, Allure `layer: integration`',
  },
  {
    id: 'ui_e2e',
    epics: ['end-to-end', 'ui'],
    label: 'UI / E2E (top)',
    epicNote: '`end-to-end` (+ `ui` if used)',
  },
] as const;

/**
 * Display names for epics in reports
 */
export const EPIC_DISPLAY: Record<EpicType, string> = {
  unit: 'Unit',
  api: 'Integration',
  ui: 'UI',
  'end-to-end': 'E2E',
  other: 'No epic assigned',
};

/**
 * Advisory quality gate thresholds for test pyramid
 */
export const PYRAMID_ADVISORY = {
  unitShareMin: 0.45,
  e2eShareMax: 0.28,
} as const;

/**
 * Action repository URL for footer
 */
export const ACTION_REPOSITORY_URL = 'https://github.com/quokkify/allure-report-action';

/**
 * Version from version.txt
 */
export let ACTION_VERSION = '';

export function setActionVersion(version: string): void {
  ACTION_VERSION = version;
}

/**
 * Creates an empty test summary
 */
export function emptyStats(): TestSummary {
  return { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
}
