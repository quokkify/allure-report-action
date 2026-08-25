/**
 * PR body command
 */
import * as fs from 'node:fs';
import { renderPrComment } from '../renderer/markdown.js';
import { aggregateResults, listResultFiles, readJsonSafe, getEpicForResult, readWidgetSummary, mergeSummary, } from '../report/index.js';
/**
 * Executes pr-body command
 */
export async function runPrBody(options) {
    const { resultsDir, reportDir, outputFile, pagesUrl, forkPr, sourceRunId, actionVersion, commentMarker, } = options;
    const aggregated = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), result => getEpicForResult(result));
    const widget = await readWidgetSummary(reportDir);
    const summary = mergeSummary(await widget, aggregated);
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