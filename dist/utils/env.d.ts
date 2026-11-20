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
/**
 * Environment for the Allure CLI that `npx` resolves without a lockfile. Action inputs (which carry
 * the GitHub token) and runner tokens are removed so a compromised package in that unlocked tree
 * cannot read them, and npm install scripts are disabled for the resolution.
 */
export declare function allureCliEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv;
//# sourceMappingURL=env.d.ts.map