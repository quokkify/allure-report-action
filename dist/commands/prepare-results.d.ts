export interface PrepareResultsCommandOptions {
    sourceRoot: string;
    resultsDir: string;
    moduleLabel: string;
    environmentLabel?: string;
    autoMode: boolean;
}
/**
 * Executes prepare-results command
 */
export declare function runPrepareResults(options: PrepareResultsCommandOptions): void;
//# sourceMappingURL=prepare-results.d.ts.map