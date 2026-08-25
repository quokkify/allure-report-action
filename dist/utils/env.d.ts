/**
 * Environment utilities
 */
/**
 * Gets boolean value from environment variable
 */
export declare function getBoolEnv(name: string, defaultValue?: boolean): boolean;
/**
 * Gets string value from environment variable
 */
export declare function getStringEnv(name: string, defaultValue?: string): string;
/**
 * Gets number value from environment variable
 */
export declare function getNumberEnv(name: string, defaultValue?: number): number;
/**
 * Checks if running in GitHub Actions
 */
export declare function isGitHubActions(): boolean;
/**
 * Gets GitHub Actions step summary path
 */
export declare function getStepSummaryPath(): string | undefined;
//# sourceMappingURL=env.d.ts.map