export interface PyramidCommandOptions {
    resultsDir: string;
    outputMd: string;
    outputJson?: string;
    policyPath?: string;
    sourceRunId?: string;
    headSha?: string;
}
/**
 * Executes pyramid command
 */
export declare function runPyramid(options: PyramidCommandOptions): void;
//# sourceMappingURL=pyramid.d.ts.map