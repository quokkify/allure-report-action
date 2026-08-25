/**
 * Report summary - reads and processes Allure widget summary
 */
import { AggregatedResults, TestSummary } from '../allure/model.js';
import { readWidgetSummary } from '../allure/parser.js';
export interface WidgetSummary {
    statistic?: TestSummary;
}
export { readWidgetSummary };
/**
 * Merges widget summary with aggregated results
 * Widget summary is the source of truth for counts, but aggregated results
 * may have additional info (like unknown results that widget omits)
 */
export declare function mergeSummary(widget: WidgetSummary | null, aggregated: AggregatedResults): TestSummary;
//# sourceMappingURL=summary.d.ts.map