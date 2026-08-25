/**
 * PR body command
 */
import * as fs from 'node:fs';

import { aggregateResults } from '../allure/parser.js';
import { renderPrComment, PrCommentData } from '../renderer/markdown.js';
import { readWidgetSummary } from '../report/summary.js';
import { mergeSummary } from '../report/summary.js';

export interface PrBodyCommandOptions {
  resultsDir: string;
  reportDir: string;
  outputFile: string;
  pagesUrl: string;
  forkPr: boolean;
  sourceRunId: string;
  actionVersion: string;
  commentMarker: string;
}

/**
 * Executes pr-body command
 */
export function runPrBody(options: PrBodyCommandOptions): void {
  const {
    resultsDir,
    reportDir,
    outputFile,
    pagesUrl,
    forkPr,
    sourceRunId,
    actionVersion,
    commentMarker,
  } = options;

  const aggregated = aggregateResults(resultsDir);
  const widget = readWidgetSummary(reportDir);
  const summary = mergeSummary(widget, aggregated);

  const data: PrCommentData = {
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
