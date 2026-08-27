/**
 * Tests for prepare results - ported from Python test_prepare_results_*
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { prepareAttributedResults, sanitizeResults } from '../../src/allure/prepare-results.js';

describe('Prepare Results', () => {
  let tempDir: string;
  let resultsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-results-test-'));
    resultsDir = path.join(tempDir, 'artifacts', 'allure-results');
    fs.mkdirSync(resultsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeResult = (dir: string, name: string, data: object) => {
    fs.writeFileSync(path.join(dir, `${name}-result.json`), JSON.stringify(data));
  };

  const writeFragment = (dir: string, content: string) => {
    fs.writeFileSync(path.join(dir, 'ci-env-fragment.properties'), content);
  };

  it('merges sources before module config', async () => {
    const config = path.join(tempDir, 'allurerc.mjs');
    fs.writeFileSync(
      config,
      'export default { variables: {\n' + "  'GitHub.RunId': '123',\n" + '} };\n'
    );

    const fixtures = [
      ['test-report-common', 'Common q4j-core', ':common-utils:core', 'core-case'],
      ['test-report-data', 'Data q4j-sql', ':data-utils:sql', 'sql-case'],
    ];

    for (const [artifact, prefix, module, uuid] of fixtures) {
      const source = path.join(tempDir, 'artifacts', artifact, 'build', 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeFragment(
        source,
        `${prefix}.Suite=Gradle TestNG\n${prefix}.Module=${module}\n${prefix}.Runner=runner-${uuid.replace(/-case$/, '')}\n`
      );
      writeResult(source, uuid, {
        uuid,
        name: uuid,
        status: 'passed',
        labels: [{ name: 'epic', value: 'unit' }],
      });
    }

    writeResult(resultsDir, 'stale', { uuid: 'stale' });
    fs.writeFileSync(path.join(resultsDir, 'environment.properties'), 'GitHub.RunId=123\n');

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    expect(fs.existsSync(path.join(resultsDir, 'stale-result.json'))).toBe(false);
    expect(fs.readFileSync(path.join(resultsDir, 'environment.properties'), 'utf8')).toBe(
      'GitHub.RunId=123\n'
    );

    // Verify module labels were applied
    for (const [, , module, uuid] of fixtures) {
      const doc = JSON.parse(fs.readFileSync(path.join(resultsDir, `${uuid}-result.json`), 'utf8'));
      expect(doc.labels).toContainEqual({ name: 'module', value: module });
    }
  });

  it('uses sidecar as authoritative module', async () => {
    const source = path.join(tempDir, 'artifacts', 'test-report', 'build', 'allure-results');
    fs.mkdirSync(source, { recursive: true });

    const sourceDoc = {
      uuid: 'direct',
      name: 'case',
      labels: [
        { name: 'module', value: 'direct-module' },
        { name: 'module', value: 'duplicate-module' },
        { name: 'epic', value: 'unit' },
      ],
    };
    writeResult(source, 'direct', sourceDoc);
    writeFragment(source, 'Suite.Module=source-module\n');

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    const merged = JSON.parse(fs.readFileSync(path.join(resultsDir, 'direct-result.json'), 'utf8'));
    expect(merged.labels).toEqual([
      { name: 'epic', value: 'unit' },
      { name: 'module', value: 'source-module' },
    ]);
  });

  it('rejects conflicting duplicate name atomically', async () => {
    fs.writeFileSync(path.join(resultsDir, 'sentinel.txt'), 'unchanged\n');

    for (const artifact of ['source-a', 'source-b']) {
      const source = path.join(tempDir, 'artifacts', artifact, 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeResult(source, 'collision', { uuid: 'collision', name: artifact, labels: [] });
      writeFragment(source, 'Suite.Module=module-a\n');
    }

    expect(() => {
      prepareAttributedResults({
        sourceRoot: path.join(tempDir, 'artifacts'),
        resultsDir,
        moduleLabel: 'module',
        autoMode: false,
      });
    }).toThrow('Conflicting source files named collision-result.json');

    expect(fs.readFileSync(path.join(resultsDir, 'sentinel.txt'), 'utf8')).toBe('unchanged\n');
  });

  it('deduplicates identical files', async () => {
    const doc = { uuid: 'same', name: 'case', labels: [], start: 1000, stop: 2000 };

    for (const artifact of ['source-a', 'source-b']) {
      const source = path.join(tempDir, 'artifacts', artifact, 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeResult(source, 'same', doc);
      writeFragment(source, 'Suite.Module=module-a\n');
    }

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    expect(fs.readdirSync(resultsDir).filter(f => f.endsWith('-result.json'))).toHaveLength(1);
  });

  it('deduplicates identical fragment variables deterministically', async () => {
    for (const [artifact, uuid] of [
      ['source-b', 'case-b'],
      ['source-a', 'case-a'],
    ]) {
      const source = path.join(tempDir, 'artifacts', artifact, 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeResult(source, uuid, { uuid, labels: [] });
      writeFragment(source, 'Z.Shared=same\nA.Module=module-a\nA.Runner=runner-a\n');
    }

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    const metadata = JSON.parse(
      fs.readFileSync(path.join(resultsDir, '.allure-module-variables.json'), 'utf8')
    );
    expect(metadata).toEqual({
      'A.Module': 'module-a',
      'A.Runner': 'runner-a',
      'Z.Shared': 'same',
    });
    expect(fs.statSync(path.join(resultsDir, '.allure-module-variables.json')).mode & 0o777).toBe(
      0o600
    );
  });
  it('ensures start and stop timestamps for duration charts', async () => {
    const source = path.join(tempDir, 'artifacts', 'test-report', 'allure-results');
    fs.mkdirSync(source, { recursive: true });
    writeResult(source, 'case-1', { uuid: 'case-1', name: 'case-1', labels: [] });
    writeFragment(source, 'Module=module-a\n');

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    const result = JSON.parse(fs.readFileSync(path.join(resultsDir, 'case-1-result.json'), 'utf8'));
    expect(typeof result.start).toBe('number');
    expect(result.start).toBeGreaterThan(0);
    expect(typeof result.stop).toBe('number');
    expect(result.stop).toBeGreaterThan(result.start);
  });
  it('preserves existing valid start and stop timestamps', async () => {
    const source = path.join(tempDir, 'artifacts', 'test-report', 'allure-results');
    fs.mkdirSync(source, { recursive: true });
    const validStart = 1000;
    const validStop = 2000;
    writeResult(source, 'case-1', { uuid: 'case-1', name: 'case-1', start: validStart, stop: validStop, labels: [] });
    writeFragment(source, 'Module=module-a\n');

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: false,
    });

    const result = JSON.parse(fs.readFileSync(path.join(resultsDir, 'case-1-result.json'), 'utf8'));
    expect(result.start).toBe(validStart);
    expect(result.stop).toBe(validStop);
  });

  it('rejects conflicting fragment variables atomically', async () => {
    fs.writeFileSync(path.join(resultsDir, 'sentinel.txt'), 'unchanged\n');

    for (const [artifact, value] of [
      ['source-a', 'one'],
      ['source-b', 'two'],
    ]) {
      const source = path.join(tempDir, 'artifacts', artifact, 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeResult(source, artifact, { uuid: artifact, labels: [] });
      writeFragment(source, `Suite.Module=module-a\nSuite.Runner=${value}\n`);
    }

    expect(() => {
      prepareAttributedResults({
        sourceRoot: path.join(tempDir, 'artifacts'),
        resultsDir,
        moduleLabel: 'module',
        autoMode: false,
      });
    }).toThrow('Conflicting environment variable Suite.Runner');

    expect(fs.readFileSync(path.join(resultsDir, 'sentinel.txt'), 'utf8')).toBe('unchanged\n');
    expect(fs.existsSync(path.join(resultsDir, '.allure-module-variables.json'))).toBe(false);
  });

  it('enforces fragment variable count boundary', async () => {
    for (const [count, succeeds] of [
      [10_000, true],
      [10_001, false],
    ]) {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `variable-count-${count}-`));
      const source = path.join(fixtureDir, 'artifacts', 'source', 'allure-results');
      const fixtureResults = path.join(fixtureDir, 'artifacts', 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      fs.mkdirSync(fixtureResults, { recursive: true });

      writeResult(source, 'case', { uuid: 'case', labels: [] });

      const variables = ['Suite.Module=module-a'];
      variables.push(...Array.from({ length: count - 1 }, (_, i) => `K${i}=v`));
      writeFragment(source, variables.join('\n'));

      try {
        prepareAttributedResults({
          sourceRoot: path.join(fixtureDir, 'artifacts'),
          resultsDir: fixtureResults,
          moduleLabel: 'module',
          autoMode: false,
        });
        if (!succeeds) throw new Error('Should have failed');
      } catch (e: any) {
        if (succeeds) throw e;
        expect(e.message).toContain('exceed count or byte limits');
      }

      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('rejects reserved metadata filename', async () => {
    fs.writeFileSync(path.join(resultsDir, 'sentinel.txt'), 'unchanged\n');

    const source = path.join(tempDir, 'artifacts', 'source', 'allure-results');
    fs.mkdirSync(source, { recursive: true });
    writeResult(source, 'case', { uuid: 'case', labels: [] });
    writeFragment(source, 'Suite.Module=module-a\n');
    fs.writeFileSync(
      path.join(source, '.allure-module-variables.json'),
      '{"Suite.Module":"module-a"}'
    );

    expect(() => {
      prepareAttributedResults({
        sourceRoot: path.join(tempDir, 'artifacts'),
        resultsDir,
        moduleLabel: 'module',
        autoMode: false,
      });
    }).toThrow('Reserved source result filename is not allowed');

    expect(fs.readFileSync(path.join(resultsDir, 'sentinel.txt'), 'utf8')).toBe('unchanged\n');
  });

  it('rejects missing module and malformed JSON', async () => {
    for (const [fixture, fragment, content, expected] of [
      ['missing', 'Suite.Runner=runner\n', '{}', 'Expected exactly one module value'],
      ['malformed', 'Suite.Module=module-a\n', '{malformed', 'Malformed Allure result JSON'],
    ]) {
      const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), `prepare-${fixture}-`));
      const source = path.join(fixtureDir, 'artifacts', 'test-report', 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      fs.writeFileSync(path.join(source, 'case-result.json'), content);
      writeFragment(source, fragment);

      try {
        prepareAttributedResults({
          sourceRoot: path.join(fixtureDir, 'artifacts'),
          resultsDir: path.join(fixtureDir, 'artifacts', 'allure-results'),
          moduleLabel: 'module',
          autoMode: false,
        });
        throw new Error('Should have failed');
      } catch (e: any) {
        expect(e.message).toContain(expected);
      }

      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('auto preserves legacy results without provenance', async () => {
    writeResult(resultsDir, 'legacy', {
      uuid: 'legacy',
      labels: [{ name: 'module', value: 'direct' }],
    });

    prepareAttributedResults({
      sourceRoot: path.join(tempDir, 'artifacts'),
      resultsDir,
      moduleLabel: 'module',
      autoMode: true,
    });

    // Should not throw and should preserve legacy
    const preserved = JSON.parse(
      fs.readFileSync(path.join(resultsDir, 'legacy-result.json'), 'utf8')
    );
    expect(preserved).toEqual({ uuid: 'legacy', labels: [{ name: 'module', value: 'direct' }] });
  });

  it('auto rejects partial provenance', async () => {
    fs.writeFileSync(path.join(resultsDir, 'sentinel.txt'), 'unchanged\n');

    for (const artifact of ['source-a', 'source-b']) {
      const source = path.join(tempDir, 'artifacts', artifact, 'allure-results');
      fs.mkdirSync(source, { recursive: true });
      writeResult(source, artifact, { uuid: artifact, labels: [] });
      if (artifact === 'source-a') {
        writeFragment(source, 'Suite.Module=module-a\n');
      }
    }

    expect(() => {
      prepareAttributedResults({
        sourceRoot: path.join(tempDir, 'artifacts'),
        resultsDir,
        moduleLabel: 'module',
        autoMode: true,
      });
    }).toThrow('Partial module provenance: 1 of 2');

    expect(fs.readFileSync(path.join(resultsDir, 'sentinel.txt'), 'utf8')).toBe('unchanged\n');
  });

  it('sanitizes passive inputs and rejects active attachment payloads', () => {
    const input = path.join(tempDir, 'downloaded');
    const output = path.join(tempDir, 'sanitized');
    fs.mkdirSync(input);
    writeResult(input, 'case', {
      uuid: 'case',
      attachments: [{ name: 'evidence', source: 'evil.html', type: 'text/html' }],
    });
    fs.writeFileSync(path.join(input, 'evil.html'), '<script>alert(1)</script>');
    expect(() => sanitizeResults({ inputDir: input, outputDir: output })).toThrow(
      'Active Allure attachment'
    );
    expect(fs.existsSync(output)).toBe(false);
  });

  it('rejects traversal references and symlinked downloaded files', () => {
    const input = path.join(tempDir, 'downloaded');
    fs.mkdirSync(input);
    writeResult(input, 'case', { uuid: 'case', attachments: [{ source: '../escape.txt' }] });
    expect(() =>
      sanitizeResults({ inputDir: input, outputDir: path.join(tempDir, 'sanitized') })
    ).toThrow('Malformed attachment reference');
    fs.rmSync(input, { recursive: true, force: true });
    fs.mkdirSync(input);
    writeResult(input, 'case', { uuid: 'case' });
    fs.symlinkSync(path.join(input, 'case-result.json'), path.join(input, 'linked.txt'));
    expect(() =>
      sanitizeResults({ inputDir: input, outputDir: path.join(tempDir, 'sanitized') })
    ).toThrow('Only regular Allure result files');
  });

  it('rejects equal, parent, and child sanitizer paths before filesystem mutation', () => {
    const input = path.join(tempDir, 'downloaded');
    fs.mkdirSync(input);
    writeResult(input, 'case', { uuid: 'case' });
    const sentinel = path.join(tempDir, 'sentinel.txt');
    fs.writeFileSync(sentinel, 'unchanged');

    for (const output of [input, path.join(input, 'child'), tempDir]) {
      expect(() => sanitizeResults({ inputDir: input, outputDir: output })).toThrow(
        'must not overlap'
      );
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('unchanged');
      expect(fs.existsSync(path.join(input, 'case-result.json'))).toBe(true);
    }
  });

  it('allows sibling and path-prefix sanitizer outputs', () => {
    for (const [inputName, outputName] of [
      ['input', 'output'],
      ['results', 'results-copy'],
    ]) {
      const input = path.join(tempDir, inputName);
      const output = path.join(tempDir, outputName);
      fs.mkdirSync(input);
      writeResult(input, 'case', { uuid: 'case' });

      sanitizeResults({ inputDir: input, outputDir: output });

      expect(fs.existsSync(path.join(output, 'case-result.json'))).toBe(true);
    }
  });

  it('collects nested result-step and container fixture attachments recursively', () => {
    const input = path.join(tempDir, 'downloaded');
    const output = path.join(tempDir, 'sanitized');
    fs.mkdirSync(input);
    writeResult(input, 'case', {
      uuid: 'case',
      attachments: [{ source: 'top.txt' }],
      steps: [
        {
          attachments: [{ source: 'step.txt' }],
          steps: [{ attachments: [{ source: 'nested-step.txt' }] }],
        },
      ],
    });
    fs.writeFileSync(
      path.join(input, 'fixture-container.json'),
      JSON.stringify({
        befores: [
          {
            attachments: [{ source: 'before.txt' }],
            steps: [{ attachments: [{ source: 'before-step.txt' }] }],
          },
        ],
        afters: [{ steps: [{ attachments: [{ source: 'after-step.txt' }] }] }],
      })
    );
    for (const attachment of [
      'top.txt',
      'step.txt',
      'nested-step.txt',
      'before.txt',
      'before-step.txt',
      'after-step.txt',
    ]) {
      fs.writeFileSync(path.join(input, attachment), `passive ${attachment}`);
    }

    sanitizeResults({ inputDir: input, outputDir: output });

    expect(fs.readdirSync(output).sort()).toEqual(fs.readdirSync(input).sort());
  });

  it('rejects missing, malformed, and active nested attachment references', () => {
    const cases: Array<[string, object, Record<string, string>, string]> = [
      [
        'missing',
        { uuid: 'case', steps: [{ attachments: [{ source: 'missing.txt' }] }] },
        {},
        'Missing Allure attachment',
      ],
      [
        'malformed',
        { uuid: 'case', steps: [{ attachments: [{}] }] },
        {},
        'Malformed attachment reference',
      ],
      [
        'active',
        { uuid: 'case', steps: [{ attachments: [{ source: 'nested.txt' }] }] },
        { 'nested.txt': '<svg onload="alert(1)"></svg>' },
        'Active content in Allure attachment',
      ],
    ];

    for (const [name, result, attachments, message] of cases) {
      const input = path.join(tempDir, name);
      const output = path.join(tempDir, `${name}-output`);
      fs.mkdirSync(input);
      writeResult(input, 'case', result);
      for (const [attachment, data] of Object.entries(attachments)) {
        fs.writeFileSync(path.join(input, attachment), data);
      }

      expect(() => sanitizeResults({ inputDir: input, outputDir: output })).toThrow(message);
      expect(fs.existsSync(output)).toBe(false);
    }
  });
});
