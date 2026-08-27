export interface SanitizeResultsOptions {
    inputDir: string;
    outputDir: string;
}
/** Copies only bounded, regular, passive Allure inputs across the trust boundary. */
export declare function sanitizeResults(options: SanitizeResultsOptions): void;
export interface PrepareResultsOptions {
    sourceRoot: string;
    resultsDir: string;
    moduleLabel: string;
    autoMode: boolean;
}
/**
 * Prepares attributed results from source directories
 */
export declare function prepareAttributedResults(options: PrepareResultsOptions): void;
//# sourceMappingURL=prepare-results.d.ts.map