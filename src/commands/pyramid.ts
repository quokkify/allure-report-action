/**
 * Pyramid command
 */
import { aggregateResults } from '../allure/parser.js';
import {
  renderPyramidMarkdown,
  generatePyramidJson,
  writePyramidFiles,
  PyramidData,
} from '../renderer/pyramid.js';

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

  const aggregated = aggregateResults(resultsDir);

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
