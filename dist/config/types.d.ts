/**
 * Configuration types for the Allure Report Action
 */
export interface ActionConfig {
    githubToken: string;
    resultsDirectory: string;
    reportDirectory: string;
    configFile: string;
    moduleEnvironmentLabel: string;
    sourceArtifactsDirectory: string;
    categoriesFile: string;
    allureVersion: string;
    prNumber: string;
    pagesUrl: string;
    forkPr: boolean;
    sourceRunId: string;
    commentFile: string;
    commentMarker: string;
    commentAuthorLogin: string;
    pyramidEnabled: boolean;
    pyramidMarkdownFile: string;
    pyramidJsonFile: string;
    pyramidGatesJsonFile: string;
    pyramidSourceRunId: string;
    pyramidHeadSha: string;
    pyramidPolicyPath: string;
    pyramidArtifactName: string;
    pyramidRetentionDays: number;
    publishPages: boolean;
    pagesDestinationDirectory: string;
    pagesBranch: string;
    pagesRetentionCount: number;
}
export interface ActionOutputs {
    reportDirectory: string;
    commentFile: string;
}
export interface AllureResult {
    uuid: string;
    name: string;
    status: string;
    stage?: string;
    start?: number;
    stop?: number;
    labels?: AllureLabel[];
}
export interface AllureLabel {
    name: string;
    value: string;
}
export interface AllureCategory {
    name: string;
    messageRegex?: string;
    matchedStatuses?: string[];
    matchedStatusesRegex?: string;
    traceRegex?: string;
    flaky?: boolean;
}
export interface AllureCategoriesFile {
    categories: AllureCategory[];
}
export interface WidgetSummary {
    statistic?: {
        total: number;
        passed: number;
        failed: number;
        broken: number;
        skipped: number;
        unknown: number;
    };
}
export interface EnvironmentInfo {
    name: string;
    variables: Record<string, string>;
}
//# sourceMappingURL=types.d.ts.map