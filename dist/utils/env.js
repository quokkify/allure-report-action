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
/**
 * Environment for the Allure CLI that `npx` resolves without a lockfile. Action inputs (which carry
 * the GitHub token), runner tokens, and runner command files (which would let it inject environment
 * into later steps that hold the token) are removed, and npm install scripts are disabled. This is
 * defence in depth, not isolation: the child still runs as the same user as the action process.
 */
const RUNNER_COMMAND_FILES = new Set([
    'GITHUB_ENV',
    'GITHUB_PATH',
    'GITHUB_OUTPUT',
    'GITHUB_STATE',
    'GITHUB_STEP_SUMMARY',
]);
export function allureCliEnv(parent) {
    const env = {};
    for (const [name, value] of Object.entries(parent)) {
        const upper = name.toUpperCase();
        if (upper.startsWith('INPUT_') ||
            upper === 'GITHUB_TOKEN' ||
            upper === 'GH_TOKEN' ||
            upper === 'ACTIONS_RUNTIME_TOKEN' ||
            upper.startsWith('ACTIONS_ID_TOKEN_REQUEST_') ||
            RUNNER_COMMAND_FILES.has(upper) ||
            upper === 'NPM_CONFIG_IGNORE_SCRIPTS') {
            continue;
        }
        env[name] = value;
    }
    env.npm_config_ignore_scripts = 'true';
    return env;
}
//# sourceMappingURL=env.js.map