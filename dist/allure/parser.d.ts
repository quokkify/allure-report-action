import { AllureResult, AllureLabel, AggregatedResults, TestSummary, EpicType } from './model.js';
/**
 * Lists all Allure result files in a directory
 */
export declare function listResultFiles(resultsDir: string): string[];
/**
 * Safely reads and parses a JSON file
 */
export declare function readJsonSafe<T>(file: string): T | null;
/**
 * Extracts a label value from Allure labels array
 */
export declare function getLabelValue(labels: AllureLabel[] | undefined, name: string): string;
/**
 * Determines the epic type for a test result
 */
export declare function getEpicForResult(result: AllureResult): EpicType;
/**
 * Aggregates test results by epic type
 */
export declare function aggregateResults(resultsDir: string): AggregatedResults;
/**
 * Reads the widget summary from generated Allure report
 */
export declare function readWidgetSummary(reportDir: string): {
    statistic?: TestSummary;
} | null;
/**
 * Calculates pass rate percentage
 */
export declare function calculatePassRate(passed: number, total: number): string;
//# sourceMappingURL=parser.d.ts.map