import * as fs from 'node:fs';
import { renderPrComment } from '../renderer/markdown.js';
import { readPrReportContext } from '../report/summary.js';
export async function runPrBody(options) {
    const context = await readPrReportContext(options.reportDir, options);
    const markdown = renderPrComment({
        context,
        forkPr: options.forkPr,
        actionVersion: options.actionVersion,
        commentMarker: options.commentMarker,
    });
    fs.writeFileSync(options.outputFile, markdown, 'utf8');
    console.log(`Wrote PR body to ${options.outputFile}`);
}
//# sourceMappingURL=pr-body.js.map