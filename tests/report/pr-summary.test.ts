import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { readPrReportContext } from '../../src/report/summary.js';
import { renderPrComment } from '../../src/renderer/markdown.js';

const options = { pagesUrl: '', forkPr: false, sourceRunId: '' };
const summary = {
  name: 'Awesome',
  plugin: 'awesome',
  status: 'passed',
  duration: 1200,
  stats: { total: 1, passed: 1, failed: 0, broken: 0, skipped: 0, unknown: 0 },
  retryTests: ['case'],
  flakyTests: ['case'],
};

describe('Allure report context', () => {
  let reportDir: string;

  beforeEach(() => {
    reportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-summary-test-'));
  });

  afterEach(() => fs.rmSync(reportDir, { recursive: true, force: true }));

  function writeJson(file: string, data: object) {
    const target = path.join(reportDir, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(data));
  }

  function writeSummary(directory: string, html = true, overrides: object = {}) {
    writeJson(path.join(directory, 'summary.json'), { ...summary, ...overrides });
    if (html) fs.writeFileSync(path.join(reportDir, directory, 'index.html'), '<html></html>');
  }

  it('uses the generated registry instead of counting raw retry attempts', async () => {
    writeSummary('awesome', true, { stats: { total: 99, failed: 99 } });
    writeJson('test-results.json', {
      byId: {
        case: {
          id: 'case',
          name: 'Retried test',
          status: 'passed',
          duration: 1200,
          environment: 'api',
        },
      },
    });
    writeJson('raw/attempt-1-result.json', { uuid: 'first', historyId: 'same', status: 'failed' });
    writeJson('raw/attempt-2-result.json', { uuid: 'second', historyId: 'same', status: 'passed' });

    const context = await readPrReportContext(reportDir, options);
    expect(context.totals.stats).toEqual({
      total: 1,
      passed: 1,
      failed: 0,
      broken: 0,
      skipped: 0,
      unknown: 0,
    });
    expect(context.totals.flags).toEqual({ new: 0, flaky: 1, retry: 1 });
    expect(context.environments[0]).toMatchObject({ name: 'api', stats: { total: 1, passed: 1 } });
  });

  it('does not add together duplicate presentations of the same test run', async () => {
    writeSummary('awesome');
    writeSummary('classic', true, { name: 'Classic', plugin: 'classic' });

    const context = await readPrReportContext(reportDir, options);
    expect(context.reports).toHaveLength(2);
    expect(context.totals.stats.total).toBe(1);
    expect(context.totals.stats.passed).toBe(1);
    expect(context.totals.flags.retry).toBe(1);
    expect(context.totals.duration).toBe(1200);
  });

  it('rejects legacy widgets instead of silently reconstructing a summary', async () => {
    writeJson('widgets/summary.json', { statistic: { total: 1, passed: 1 } });
    await expect(readPrReportContext(reportDir, options)).rejects.toThrow(
      'No Allure 3 plugin summaries found'
    );
  });

  it.each([
    ['root HTML', '', true, 'https://example.com/pr-1/?existing=yes&run=42#section'],
    [
      'nested HTML',
      'reports/awesome',
      true,
      'https://example.com/pr-1/reports/awesome?existing=yes&run=42#section',
    ],
    ['non-HTML plugin', 'csv', false, 'https://example.com/pr-1/?existing=yes&run=42#section'],
  ])(
    'builds the Pages URL for %s without moving query parameters into the path',
    async (_name, directory, html, expected) => {
      writeSummary(directory, html, {
        remoteHref: 'https://old.example/report',
        href: './index.html',
      });
      const context = await readPrReportContext(reportDir, {
        ...options,
        pagesUrl: 'https://example.com/pr-1/?existing=yes&run=old#section',
        sourceRunId: '42',
      });
      expect(context.reports[0].remoteHref).toBe(expected);
      expect(context.reports[0].href).toBeUndefined();
    }
  );

  it('preserves upstream remote links when no Pages override is supplied', async () => {
    writeSummary('', true, { remoteHref: 'https://upstream.example/report', href: './index.html' });
    const context = await readPrReportContext(reportDir, options);
    expect(context.reports[0].remoteHref).toBe('https://upstream.example/report');
    expect(context.reports[0].href).toBeUndefined();
  });

  it('suppresses metadata and override links for forks', async () => {
    writeSummary('', true, {
      remoteHref: 'https://metadata.example/report',
      href: 'https://local.example/report',
    });
    const context = await readPrReportContext(reportDir, {
      ...options,
      forkPr: true,
      pagesUrl: 'https://pages.example/report',
    });
    expect(context.reports[0].remoteHref).toBeUndefined();
    expect(context.reports[0].href).toBeUndefined();
    const body = renderPrComment({
      context,
      forkPr: true,
      actionVersion: '1',
      commentMarker: '<!-- marker -->',
    });
    for (const host of ['metadata.example', 'local.example', 'pages.example'])
      expect(body).not.toContain(host);
    expect(body).toContain('GitHub Pages previews are disabled for fork pull requests');
  });

  it('rejects non-HTTP Pages URLs', async () => {
    writeSummary('');
    await expect(
      readPrReportContext(reportDir, { ...options, pagesUrl: 'javascript:alert(1)' })
    ).rejects.toThrow('pages-url must be an HTTP or HTTPS URL');
  });
});
