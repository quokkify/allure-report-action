/**
 * Tests for module config - ported from Python test_module_config_*
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { generateModuleConfig } from '../../src/allure/config-generator.js';

describe('Module Config Generator', () => {
  let tempDir: string;
  let resultsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'module-config-test-'));
    resultsDir = path.join(tempDir, 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeResult = (name: string, data: object) => {
    fs.writeFileSync(path.join(resultsDir, `${name}-result.json`), JSON.stringify(data));
  };

  it('splits module variables and preserves global values', async () => {
    const config = path.join(tempDir, 'allurerc.mjs');
    fs.writeFileSync(
      config,
      'export default {\n' +
        '  variables: {\n' +
        "    'GitHub.RunId': '123',\n" +
        "    'Default.Runner': 'runner-default',\n" +
        "    'Module A.Runner': 'runner-a',\n" +
        "    'Module B.Runner': 'runner-b',\n" +
        "    'Module C.Module': 'module-c',\n" +
        "    'Module C.Runner': 'runner-c',\n" +
        '  },\n' +
        '};\n'
    );

    for (const module of ['default', 'module-a', 'module-b']) {
      writeResult(module, {
        uuid: module,
        name: module,
        status: 'passed',
        labels: [{ name: 'module', value: module }],
      });
    }

    const effective = path.join(tempDir, 'effective.mjs');
    await generateModuleConfig({
      resultsDir,
      configFile: config,
      outputFile: effective,
      moduleLabel: 'module',
    });

    const mod = await import(effective);
    const c = mod.default;
    const e = Object.fromEntries(
      Object.entries(c.environments).map(([id, v]: any) => [
        id,
        {
          name: v.name,
          variables: v.variables,
          matches: v.matcher({ labels: [{ name: 'module', value: v.name }] }),
        },
      ])
    );

    expect(c.variables).toEqual({ 'GitHub.RunId': '123' });
    expect(e).toEqual({
      'default-2': { name: 'default', variables: { Runner: 'runner-default' }, matches: true },
      'module-a': { name: 'module-a', variables: { Runner: 'runner-a' }, matches: true },
      'module-b': { name: 'module-b', variables: { Runner: 'runner-b' }, matches: true },
      'module-c': {
        name: 'module-c',
        variables: { Module: 'module-c', Runner: 'runner-c' },
        matches: true,
      },
    });
  });

  it('keeps legacy already merged mode when no provenance', async () => {
    const config = path.join(tempDir, 'allurerc.mjs');
    fs.writeFileSync(config, 'export default {};\n');

    writeResult('legacy', { uuid: 'legacy', name: 'case', labels: [] });

    // Create source with provenance but don't run prepare-results
    const source = path.join(tempDir, 'artifacts', 'test-report', 'build', 'allure-results');
    fs.mkdirSync(source, { recursive: true });
    writeResult('legacy', { uuid: 'legacy', name: 'case', labels: [] });
    fs.writeFileSync(path.join(source, 'ci-env-fragment.properties'), 'Suite.Module=module-a\n');

    const effective = path.join(tempDir, 'effective.mjs');
    await generateModuleConfig({
      resultsDir,
      configFile: config,
      outputFile: effective,
      moduleLabel: 'module',
    });

    const mod = await import(effective);
    const c = mod.default;

    // Should preserve original labels (empty) since no prepare-results was run
    const unchanged = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'legacy-result.json'), 'utf8')
    );
    expect(unchanged.labels).toEqual([]);
  });

  it('rejects invalid module variable metadata', async () => {
    const fixtures = [
      ['malformed', '{', 'Malformed module environment metadata'],
      ['array', '[]', 'Invalid module environment metadata'],
      ['null', 'null', 'Invalid module environment metadata'],
      ['non-string', '{"Suite.Module":42}', 'Invalid module environment metadata'],
      ['prototype', '{"__proto__":"attacker"}', 'Invalid module environment metadata'],
    ];

    for (const [fixture, metadata, expected] of fixtures) {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `module-metadata-${fixture}-`));
      const fixtureResults = path.join(fixtureDir, 'results');
      fs.mkdirSync(fixtureResults);

      writeResult('case', { uuid: 'case', labels: [{ name: 'module', value: 'module-a' }] });
      fs.writeFileSync(path.join(fixtureResults, '.allure-module-variables.json'), metadata);

      const fixtureConfig = path.join(fixtureDir, 'allurerc.mjs');
      fs.writeFileSync(fixtureConfig, 'export default {};\n');

      const fixtureEffective = path.join(fixtureDir, 'effective.mjs');

      try {
        await generateModuleConfig({
          resultsDir: fixtureResults,
          configFile: fixtureConfig,
          outputFile: fixtureEffective,
          moduleLabel: 'module',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        expect(e.message).toContain(expected);
      }

      expect(fs.existsSync(fixtureEffective)).toBe(false);
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('enforces metadata size boundary', async () => {
    const limit = 4 * 1024 * 1024;

    for (const [size, succeeds] of [
      [limit, true],
      [limit + 1, false],
    ]) {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `module-metadata-size-`));
      const fixtureResults = path.join(fixtureDir, 'results');
      fs.mkdirSync(fixtureResults);

      writeResult('case', { uuid: 'case', labels: [{ name: 'module', value: 'module-a' }] });

      const payload = '{"Suite.Module":"module-a"}';
      fs.writeFileSync(
        path.join(fixtureResults, '.allure-module-variables.json'),
        payload + ' '.repeat(size - payload.length)
      );

      const fixtureConfig = path.join(fixtureDir, 'allurerc.mjs');
      fs.writeFileSync(fixtureConfig, 'export default {};\n');

      const fixtureEffective = path.join(fixtureDir, 'effective.mjs');

      try {
        await generateModuleConfig({
          resultsDir: fixtureResults,
          configFile: fixtureConfig,
          outputFile: fixtureEffective,
          moduleLabel: 'module',
        });
        if (!succeeds) throw new Error('Should have failed');
      } catch (e: any) {
        if (succeeds) throw e;
        expect(e.message).toContain('Invalid module environment metadata');
      }

      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects non-regular module variable metadata', async () => {
    for (const fixture of ['symlink', 'directory']) {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `module-metadata-${fixture}-`));
      const fixtureResults = path.join(fixtureDir, 'results');
      fs.mkdirSync(fixtureResults);

      const metadata = path.join(fixtureResults, '.allure-module-variables.json');
      if (fixture === 'symlink') {
        const target = path.join(fixtureDir, 'outside.json');
        fs.writeFileSync(target, '{"Suite.Module":"attacker"}');
        fs.symlinkSync(target, metadata);
      } else {
        fs.mkdirSync(metadata);
      }

      const fixtureConfig = path.join(fixtureDir, 'allurerc.mjs');
      fs.writeFileSync(fixtureConfig, 'export default {};\n');

      const fixtureEffective = path.join(fixtureDir, 'effective.mjs');

      try {
        await generateModuleConfig({
          resultsDir: fixtureResults,
          configFile: fixtureConfig,
          outputFile: fixtureEffective,
          moduleLabel: 'module',
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        expect(e.message).toContain('Invalid module environment metadata');
      }

      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
