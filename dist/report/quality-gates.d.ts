import { LayerSummary, PYRAMID_ADVISORY } from './model.js';
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
 * Formats count-scaled pyramid diagram
 */
export declare function formatCountScaledPyramidDiagram(layers: LayerSummary[]): string[];
/**
 * Writes quality gates JSON
 */
export declare function writeQualityGatesJson(gates: QualityGates, metrics: PyramidMetrics, outputPath: string): void;
export declare function emitGithubWarning(title: string, message: string): void;
/**
 * Appends to GitHub job summary
 */
export declare function appendJobSummary(markdown: string): void;
//# sourceMappingURL=quality-gates.d.ts.map