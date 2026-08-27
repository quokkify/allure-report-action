/**
 * Report domain models - core types for representing the test report
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
 * Display names for epics in reports
 */
export declare const EPIC_DISPLAY: Record<EpicType, string>;
/**
 * Test pyramid layers definition
 */
export declare const PYRAMID_LAYERS: readonly [{
    readonly id: "unit";
    readonly epics: readonly ["unit"];
    readonly label: "Unit (base)";
    readonly epicNote: "`unit`";
}, {
    readonly id: "api";
    readonly epics: readonly ["api"];
    readonly label: "Integration (middle)";
    readonly epicNote: "`epic: api`, Allure `layer: integration`";
}, {
    readonly id: "ui_e2e";
    readonly epics: readonly ["end-to-end", "ui"];
    readonly label: "UI / E2E (top)";
    readonly epicNote: "`end-to-end` (+ `ui` if used)";
}];
/**
 * Advisory quality gate thresholds for test pyramid
 */
export declare const PYRAMID_ADVISORY: {
    readonly unitShareMin: 0.45;
    readonly e2eShareMax: 0.28;
};
/**
 * Action repository URL for footer
 */
export declare const ACTION_REPOSITORY_URL = "https://github.com/quokkify/allure-report-action";
/**
 * Version from version.txt
 */
export declare let ACTION_VERSION: string;
export declare function setActionVersion(version: string): void;
/**
 * Creates an empty test summary
 */
export declare function emptyStats(): TestSummary;
//# sourceMappingURL=model.d.ts.map