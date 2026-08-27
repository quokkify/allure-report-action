/**
 * Regression tests for destructive CLI argument validation.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const cli = path.resolve(__dirname, '../dist/cli.cjs');

describe('sanitize-results CLI', () => {
  let tempDir: string;
  let input: string;
  let output: string;
  let sentinel: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sanitize-cli-test-'));
    input = path.join(tempDir, 'input');
    output = path.join(tempDir, 'output');
    sentinel = path.join(tempDir, 'sentinel.txt');
    fs.mkdirSync(input);
    fs.writeFileSync(path.join(input, 'case-result.json'), JSON.stringify({ uuid: 'case' }));
    fs.writeFileSync(sentinel, 'unchanged');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const run = (args: string[]) =>
    spawnSync(process.execPath, [cli, 'sanitize-results', ...args], {
      cwd: tempDir,
      encoding: 'utf8',
    });

  it.each([
    ['missing input', ['--output', 'output'], '--input'],
    ['missing output', ['--input', 'input'], '--output'],
    ['empty input', ['--input', '', '--output', 'output'], '--input'],
    ['empty output', ['--input', 'input', '--output', '  '], '--output'],
  ])('rejects %s without filesystem mutation', (_name, args, expected) => {
    const result = run(args);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`${expected} is required and must not be empty`);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('unchanged');
    expect(fs.existsSync(path.join(input, 'case-result.json'))).toBe(true);
    expect(fs.existsSync(output)).toBe(false);
  });

  it('sanitizes results when both required paths are valid', () => {
    const result = run(['--input', 'input', '--output', 'output']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(fs.existsSync(path.join(output, 'case-result.json'))).toBe(true);
    expect(fs.readFileSync(sentinel, 'utf8')).toBe('unchanged');
  });
});
