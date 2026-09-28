import type { ReportContext } from '@allurereport/ci/report-context';
export interface PrCommentData {
    context: ReportContext;
    forkPr: boolean;
    actionVersion: string;
    commentMarker: string;
}
export declare function renderPrComment(data: PrCommentData): string;
//# sourceMappingURL=markdown.d.ts.map