import { AggregatedResults, TestSummary } from '../allure/model.js';
export interface WidgetSummary {
    statistic?: TestSummary;
}
/**
 * Reads widget summary from Allure report
 */
export declare function readWidgetSummary(reportDir: string): WidgetSummary | null;
/**
 * Merges widget summary with aggregated results
 * Widget summary is the source of truth for counts, but aggregated results
 * may have additional info (like unknown results that widget omits)
 */
export declare function mergeSummary(widget: WidgetSummary | null, aggregated: AggregatedResults): TestSummary;
//# sourceMappingURL=summary.d.ts.map