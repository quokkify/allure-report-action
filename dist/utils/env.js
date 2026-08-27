/**
 * Environment utilities
 */
/**
 * Gets boolean value from environment variable
 */
export function getBoolEnv(name, defaultValue = false) {
    const value = process.env[name];
    if (!value)
        return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
}
/**
 * Gets string value from environment variable
 */
export function getStringEnv(name, defaultValue = '') {
    return process.env[name] ?? defaultValue;
}
/**
 * Gets number value from environment variable
 */
export function getNumberEnv(name, defaultValue = 0) {
    const value = process.env[name];
    if (!value)
        return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
}
/**
 * Checks if running in GitHub Actions
 */
export function isGitHubActions() {
    return getBoolEnv('GITHUB_ACTIONS');
}
/**
 * Gets GitHub Actions step summary path
 */
export function getStepSummaryPath() {
    return process.env.GITHUB_STEP_SUMMARY;
}
//# sourceMappingURL=env.js.map