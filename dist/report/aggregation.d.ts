/**
 * Report aggregation - aggregates Allure results into report model
 */
import { TestSummary, EpicType, LayerSummary } from './model.js';
/**
 * Aggregates Allure results into the report model
 */
export interface AggregationResult {
    byEpic: Record<EpicType, TestSummary>;
    total: TestSummary;
    resultCount: number;
    layers: LayerSummary[];
    otherEpicTotal: number;
    pyramidTotal: number;
    unitShare: number;
    apiShare: number;
    e2eShare: number;
}
/**
 * Calculates pass rate percentage
 */
export declare function calculatePassRate(passed: number, total: number): string;
/**
 * Aggregates Allure results into the report model
 */
export declare function aggregateResults(files: string[], readJsonFile: (file: string) => {
    status?: string;
    labels?: {
        name: string;
        value: string;
    }[];
} | null, getEpicForResult: (result: {
    labels?: {
        name: string;
        value: string;
    }[];
}) => EpicType): AggregationResult;
//# sourceMappingURL=aggregation.d.ts.map