import { AllureLabel, EpicType } from './model.js';
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
export declare function getEpicForResult(result: {
    labels?: {
        name: string;
        value: string;
    }[];
}): EpicType;
/**
 * Calculates pass rate percentage
 */
export declare function calculatePassRate(passed: number, total: number): string;
//# sourceMappingURL=parser.d.ts.map