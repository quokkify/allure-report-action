/**
 * Pyramid command
 */
import {
  renderPyramidMarkdown,
  generatePyramidJson,
  writePyramidFiles,
  PyramidData,
} from '../renderer/pyramid.js';
import {
  aggregateResults,
  listResultFiles,
  readJsonSafe,
  getEpicForResult,
} from '../report/index.js';

export interface PyramidCommandOptions {
  resultsDir: string;
  outputMd: string;
  outputJson?: string;
  policyPath?: string;
  sourceRunId?: string;
  headSha?: string;
}

/**
 * Executes pyramid command
 */
export function runPyramid(options: PyramidCommandOptions): void {
  const { resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha } = options;

  const aggregated = aggregateResults(
    listResultFiles(resultsDir),
    (file: string) => readJsonSafe(file),
    result => getEpicForResult(result as any)
  );

  const data: PyramidData = {
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
