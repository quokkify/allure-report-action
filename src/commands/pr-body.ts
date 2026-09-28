import * as fs from 'node:fs';

import { renderPrComment } from '../renderer/markdown.js';
import { readPrReportContext } from '../report/summary.js';

export interface PrBodyCommandOptions {
  /** Accepted for CLI compatibility; summary data comes from the generated report. */
  resultsDir: string;
  reportDir: string;
  outputFile: string;
  pagesUrl: string;
  forkPr: boolean;
  sourceRunId: string;
  actionVersion: string;
  commentMarker: string;
}

export async function runPrBody(options: PrBodyCommandOptions): Promise<void> {
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
