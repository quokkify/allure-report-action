/**
 * Rewrites Allure 2 result, container, and globals documents in `resultsDir` so every referenced
 * attachment has a passive declared type and a passive file extension. Non-passive types become
 * `text/plain`; non-passive or missing extensions are fixed by appending one and renaming the file.
 */
export declare function neutralizeAttachments(resultsDir: string): {
    renamed: number;
    retyped: number;
};
/**
 * Replaces any file under a generated report's `data/attachments` directories whose extension is
 * not passive with an inert notice. Covers attachments Allure creates from inputs other than
 * Allure 2 results (for example Cucumber JSON embeddings), which the pre-generation pass cannot see.
 */
export declare function neutralizeReportAttachments(reportDir: string): number;
//# sourceMappingURL=attachment-policy.d.ts.map