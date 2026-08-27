export interface PrBodyCommandOptions {
    resultsDir: string;
    reportDir: string;
    outputFile: string;
    pagesUrl: string;
    forkPr: boolean;
    sourceRunId: string;
    actionVersion: string;
    commentMarker: string;
}
/**
 * Executes pr-body command
 */
export declare function runPrBody(options: PrBodyCommandOptions): Promise<void>;
//# sourceMappingURL=pr-body.d.ts.map