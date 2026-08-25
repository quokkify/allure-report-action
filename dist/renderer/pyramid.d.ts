import { AggregatedResults, PYRAMID_ADVISORY } from '../report/index.js';
export interface PyramidData {
    aggregated: AggregatedResults;
    sourceRunId?: string;
    headSha?: string;
    policyPath?: string;
    outputMd?: string;
}
export interface PyramidMetrics {
    pyramidTotal: number;
    unitShare: number;
    apiShare: number;
    e2eShare: number;
    otherEpicTotal: number;
}
export interface QualityGateWarning {
    id: string;
    message: string;
}
export interface QualityGates {
    blockingFailures: {
        id: string;
        message: string;
    }[];
    warnings: QualityGateWarning[];
    advisoryOnly: boolean;
    thresholds: typeof PYRAMID_ADVISORY;
}
export interface QualityGateWarning {
    id: string;
    message: string;
}
/**
 * Renders pyramid markdown
 */
export declare function renderPyramidMarkdown(data: PyramidData): string;
/**
 * Generates pyramid JSON payload
 */
export declare function generatePyramidJson(data: PyramidData): object;
/**
 * Writes pyramid files
 */
export declare function writePyramidFiles(markdown: string, json: object, markdownPath: string, jsonPath: string): void;
//# sourceMappingURL=pyramid.d.ts.map