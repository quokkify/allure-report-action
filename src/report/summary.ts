import { existsSync } from 'node:fs';
import path from 'node:path';

import { createReportContext, type ReportContext } from '@allurereport/ci/report-context';

export interface ReportLinkOptions {
  pagesUrl: string;
  forkPr: boolean;
  sourceRunId: string;
}

export async function readPrReportContext(
  reportDir: string,
  options: ReportLinkOptions
): Promise<ReportContext> {
  const context = await createReportContext(reportDir, { onError: console.warn });
  if (!context.reports.length) {
    throw new Error(
      `No Allure 3 plugin summaries found in ${reportDir}. Generate the report before creating the PR comment.`
    );
  }

  context.reports = context.reports.map(report => {
    let remoteHref = options.forkPr ? undefined : report.remoteHref;
    if (options.pagesUrl && !options.forkPr) {
      const url = new URL(options.pagesUrl);
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('pages-url must be an HTTP or HTTPS URL');
      }
      // Match allure-action: only append a plugin directory when it contains HTML.
      if (
        report.summaryFile &&
        existsSync(path.join(path.dirname(report.summaryFile), 'index.html'))
      ) {
        const suffix = report.reportPath;
        if (suffix) {
          url.pathname = `${url.pathname.replace(/\/$/, '')}/${suffix}`;
        }
      }
      if (options.sourceRunId) url.searchParams.set('run', options.sourceRunId);
      remoteHref = url.toString();
    }
    // Local report paths cannot be opened from a GitHub comment.
    return { ...report, href: undefined, remoteHref };
  });

  return context;
}
