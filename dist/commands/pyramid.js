/**
 * Pyramid command
 */
import { renderPyramidMarkdown, generatePyramidJson, writePyramidFiles, } from '../renderer/pyramid.js';
import { aggregateResults, listResultFiles, readJsonSafe, getEpicForResult, } from '../report/index.js';
/**
 * Executes pyramid command
 */
export function runPyramid(options) {
    const { resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha } = options;
    const aggregated = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), result => getEpicForResult(result));
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