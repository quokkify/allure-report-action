import { AggregatedResults, PYRAMID_ADVISORY } from '../allure/model.js';
export interface PyramidData {
    aggregated: AggregatedResults;
    sourceRunId?: string;
    headSha?: string;
    policyPath?: string;
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
/**
 * Evaluates pyramid quality gates
 */
export declare function evaluatePyramidQualityGates(metrics: PyramidMetrics): QualityGates;
/**
 * Formats quality gates as markdown section
 */
export declare function formatQualityGatesMarkdownSection(gates: QualityGates, metrics: PyramidMetrics): string;
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
/**
 * Writes quality gates JSON
 */
export declare function writeQualityGatesJson(gates: QualityGates, metrics: PyramidMetrics, outputPath: string): void;
export declare function emitGithubWarning(title: string, message: string): void;
/**
 * Appends to GitHub job summary
 */
export declare function appendJobSummary(markdown: string): void;
//# sourceMappingURL=pyramid.d.ts.map