/**
 * PR body command
 */
import * as fs from 'node:fs';
import { aggregateResults } from '../allure/parser.js';
import { renderPrComment } from '../renderer/markdown.js';
import { readWidgetSummary } from '../report/summary.js';
import { mergeSummary } from '../report/summary.js';
/**
 * Executes pr-body command
 */
export function runPrBody(options) {
    const { resultsDir, reportDir, outputFile, pagesUrl, forkPr, sourceRunId, actionVersion, commentMarker, } = options;
    const aggregated = aggregateResults(resultsDir);
    const widget = readWidgetSummary(reportDir);
    const summary = mergeSummary(widget, aggregated);
    const data = {
        summary,
        aggregated,
        pagesUrl,
        forkPr,
        sourceRunId,
        actionVersion,
        commentMarker,
    };
    const markdown = renderPrComment(data);
    fs.writeFileSync(outputFile, markdown, 'utf8');
    console.log(`Wrote PR body to ${outputFile}`);
}
//# sourceMappingURL=pr-body.js.map