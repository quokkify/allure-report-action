/**
 * Allure-specific types - only Allure-specific domain types
 */

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
 * Allure category configuration
 */
export interface AllureCategory {
  name: string;
  messageRegex?: string;
  matchedStatuses?: string[];
  matchedStatusesRegex?: string;
  traceRegex?: string;
  flaky?: boolean;
}

/**
 * Allure categories file
 */
export interface AllureCategoriesFile {
  categories: AllureCategory[];
}

/**
 * Known epic types for test pyramid classification
 */
export type EpicType = 'unit' | 'api' | 'ui' | 'end-to-end' | 'other';
