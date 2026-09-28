import { type ReportContext } from '@allurereport/ci/report-context';
export interface ReportLinkOptions {
    pagesUrl: string;
    forkPr: boolean;
    sourceRunId: string;
}
export declare function readPrReportContext(reportDir: string, options: ReportLinkOptions): Promise<ReportContext>;
//# sourceMappingURL=summary.d.ts.map