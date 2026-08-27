/**
 * Report domain models - core types for representing the test report
 */
/**
 * Display names for epics in reports
 */
export const EPIC_DISPLAY = {
    unit: 'Unit',
    api: 'Integration',
    ui: 'UI',
    'end-to-end': 'E2E',
    other: 'No epic assigned',
};
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
];
/**
 * Advisory quality gate thresholds for test pyramid
 */
export const PYRAMID_ADVISORY = {
    unitShareMin: 0.45,
    e2eShareMax: 0.28,
};
/**
 * Action repository URL for footer
 */
export const ACTION_REPOSITORY_URL = 'https://github.com/quokkify/allure-report-action';
/**
 * Version from version.txt
 */
export let ACTION_VERSION = '';
export function setActionVersion(version) {
    ACTION_VERSION = version;
}
/**
 * Creates an empty test summary
 */
export function emptyStats() {
    return { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
}
//# sourceMappingURL=model.js.map