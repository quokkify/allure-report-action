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
  return !!process.env.GITHUB_ACTIONS;
}

/**
 * Gets GitHub Actions step summary path
 */
export function getStepSummaryPath(): string | undefined {
  return process.env.GITHUB_STEP_SUMMARY;
}
