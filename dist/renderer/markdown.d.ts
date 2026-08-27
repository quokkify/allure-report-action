/**
 * Markdown renderer - generates PR comment markdown from domain model
 */
import { AggregatedResults, TestSummary } from '../report/index.js';
export interface PrCommentData {
    summary: TestSummary;
    aggregated: AggregatedResults;
    pagesUrl: string;
    forkPr: boolean;
    sourceRunId: string;
    actionVersion: string;
    commentMarker: string;
}
/**
 * Main render function - generates PR comment markdown
 */
export declare function renderPrComment(data: PrCommentData): string;
//# sourceMappingURL=markdown.d.ts.map