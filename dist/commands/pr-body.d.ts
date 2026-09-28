export interface PrBodyCommandOptions {
    /** Accepted for CLI compatibility; summary data comes from the generated report. */
    resultsDir: string;
    reportDir: string;
    outputFile: string;
    pagesUrl: string;
    forkPr: boolean;
    sourceRunId: string;
    actionVersion: string;
    commentMarker: string;
}
export declare function runPrBody(options: PrBodyCommandOptions): Promise<void>;
//# sourceMappingURL=pr-body.d.ts.map