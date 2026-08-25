/**
 * PR body command
 */
import * as fs from 'node:fs';

import { renderPrComment, PrCommentData } from '../renderer/markdown.js';
import {
  aggregateResults,
  listResultFiles,
  readJsonSafe,
  getEpicForResult,
  readWidgetSummary,
  mergeSummary,
} from '../report/index.js';

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
export async function runPrBody(options: PrBodyCommandOptions): Promise<void> {
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

  const aggregated = aggregateResults(
    listResultFiles(resultsDir),
    (file: string) => readJsonSafe(file),
    result => getEpicForResult(result as any)
  );
  const widget = await readWidgetSummary(reportDir);
  const summary = mergeSummary(await widget, aggregated);

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
