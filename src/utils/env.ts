/**
 * Environment utilities
 */

/**
 * Gets boolean value from environment variable
 */
export function getBoolEnv(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Gets string value from environment variable
 */
export function getStringEnv(name: string, defaultValue = ''): string {
  return process.env[name] ?? defaultValue;
}

/**
 * Gets number value from environment variable
 */
export function getNumberEnv(name: string, defaultValue = 0): number {
  const value = process.env[name];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Checks if running in GitHub Actions
 */
export function isGitHubActions(): boolean {
  return getBoolEnv('GITHUB_ACTIONS');
}

/**
 * Gets GitHub Actions step summary path
 */
export function getStepSummaryPath(): string | undefined {
  return process.env.GITHUB_STEP_SUMMARY;
}

/**
 * Environment for the Allure CLI that `npx` resolves without a lockfile. Action inputs (which carry
 * the GitHub token) and runner tokens are removed so a compromised package in that unlocked tree
 * cannot read them, and npm install scripts are disabled for the resolution.
 */
export function allureCliEnv(parent: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(parent)) {
    const upper = name.toUpperCase();
    if (
      upper.startsWith('INPUT_') ||
      upper === 'GITHUB_TOKEN' ||
      upper === 'GH_TOKEN' ||
      upper === 'ACTIONS_RUNTIME_TOKEN' ||
      upper.startsWith('ACTIONS_ID_TOKEN_REQUEST_') ||
      upper === 'NPM_CONFIG_IGNORE_SCRIPTS'
    ) {
      continue;
    }
    env[name] = value;
  }
  env.npm_config_ignore_scripts = 'true';
  return env;
}
