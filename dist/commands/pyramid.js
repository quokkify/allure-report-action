/**
 * Pyramid command
 */
import { aggregateResults } from '../allure/parser.js';
import { renderPyramidMarkdown, generatePyramidJson, writePyramidFiles, } from '../renderer/pyramid.js';
/**
 * Executes pyramid command
 */
export function runPyramid(options) {
    const { resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha } = options;
    const aggregated = aggregateResults(resultsDir);
    const data = {
        aggregated,
        sourceRunId,
        headSha,
        policyPath,
        outputMd,
    };
    const markdown = renderPyramidMarkdown(data);
    const json = generatePyramidJson(data);
    writePyramidFiles(markdown, json, outputMd, outputJson || '');
}
//# sourceMappingURL=pyramid.js.map