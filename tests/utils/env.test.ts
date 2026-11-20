/**
 * Regression guards for the environment handed to the npx-resolved Allure CLI.
 */
import { describe, it, expect } from 'vitest';
import { allureCliEnv } from '../../src/utils/env.js';

describe('allureCliEnv', () => {
  const parent = {
    PATH: '/usr/bin',
    HOME: '/home/runner',
    GITHUB_WORKSPACE: '/work',
    GITHUB_RUN_ID: '123',
    'INPUT_GITHUB-TOKEN': 'secret-a',
    INPUT_GITHUB_TOKEN: 'secret-b',
    'input_github-token': 'secret-c',
    'INPUT_RESULTS-DIRECTORY': 'results',
    GITHUB_TOKEN: 'secret-d',
    GH_TOKEN: 'secret-e',
    gh_token: 'secret-f',
    ACTIONS_RUNTIME_TOKEN: 'secret-g',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'secret-h',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://token.invalid',
    npm_config_ignore_scripts: 'false',
    NPM_CONFIG_IGNORE_SCRIPTS: 'false',
  };

  it('regression guard: removes every token-bearing variable and all action inputs', () => {
    const env = allureCliEnv(parent);

    expect(Object.values(env)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^secret-/)])
    );
    for (const name of Object.keys(env)) {
      expect(name.toUpperCase()).not.toMatch(/^INPUT_|TOKEN/);
    }
    expect(env).not.toHaveProperty('ACTIONS_ID_TOKEN_REQUEST_URL');
  });

  it('regression guard: disables npm install scripts for the npx resolution', () => {
    const env = allureCliEnv(parent);

    expect(env.npm_config_ignore_scripts).toBe('true');
    expect(env).not.toHaveProperty('NPM_CONFIG_IGNORE_SCRIPTS');
  });

  it('keeps the variables the Allure CLI needs to run and detect CI', () => {
    const env = allureCliEnv(parent);

    expect(env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/home/runner',
      GITHUB_WORKSPACE: '/work',
      GITHUB_RUN_ID: '123',
    });
  });

  it('does not mutate the parent environment', () => {
    const copy = { ...parent };
    allureCliEnv(copy);
    expect(copy).toEqual(parent);
  });
});
