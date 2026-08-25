/**
 * Tests for PR summary edge cases - ported from Python test_pr_summary_*
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { aggregateResults } from '../../src/report/aggregation.js';
import {
  listResultFiles,
  readJsonSafe,
  getEpicForResult,
  readWidgetSummary,
  mergeSummary,
} from '../../src/report/index.js';
import { renderPrComment } from '../../src/renderer/markdown.js';
describe('PR Summary Edge Cases', () => {
  let tempDir: string;
  let resultsDir: string;
  let reportDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-summary-test-'));
    resultsDir = path.join(tempDir, 'results');
    reportDir = path.join(tempDir, 'report');
    fs.mkdirSync(resultsDir, { recursive: true });
    fs.mkdirSync(path.join(reportDir, 'widgets'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeResult = (name: string, data: object) => {
    fs.writeFileSync(path.join(resultsDir, `${name}-result.json`), JSON.stringify(data));
  };

  const writeWidgetSummary = (data: object) => {
    fs.writeFileSync(path.join(reportDir, 'widgets', 'summary.json'), JSON.stringify(data));
  };

  it('246 passed fixture uses single footer separator', async () => {
    for (let i = 0; i < 246; i++) {
      writeResult(`${i}`, { status: 'passed', labels: [] });
    }
    writeWidgetSummary({
      statistic: { total: 246, passed: 246, failed: 0, broken: 0, skipped: 0, unknown: 0 },
    });

    const files = listResultFiles(resultsDir);
    const agg = aggregateResults(files, readJsonSafe, getEpicForResult);
    const widget = await readWidgetSummary(reportDir);
    const summary = mergeSummary(widget, agg);

    const markdown = renderPrComment({
      summary,
      aggregated: agg,
      pagesUrl: 'https://quokkify.github.io/q4j/allure/pr-535/?run=32841209876',
      forkPr: false,
      sourceRunId: '32841209876',
      actionVersion: '0.1.0',
      commentMarker: '<!-- test-marker -->',
    });

    expect(markdown).toContain('246 / 246 tests passed · 100% pass rate');
    expect(markdown).toContain(
      '| 246 | 246 | 0 | 0 | 0 | [View report ↗](https://quokkify.github.io/q4j/allure/pr-535/?run=32841209876) |'
    );
    expect(markdown).toContain('| No epic assigned | 246 | 246 | 0 | 0 | 0 |');
    expect(markdown).toContain('| All layers | 246 | 246 | 0 | 0 | 0 |');
    expect(markdown).not.toContain(
      '| **All layers** | **246** | **246** | **0** | **0** | **0** |'
    );
    expect(markdown).toContain('</details>\n\n<sub>');
    expect(markdown).not.toContain('</details>\n\n\n<sub>');
  });

  describe('statuses: failure, zero, unknown', () => {
    const cases = [
      [
        'failed',
        { failed: 1, broken: 0, passed: 1, skipped: 0, unknown: 0 },
        '## ❌ Allure Report — failures detected',
        '1 failed',
      ],
      [
        'empty',
        { failed: 0, broken: 0, passed: 0, skipped: 0, unknown: 0 },
        '## ⚪ Allure Report — no tests',
        'No tests found · no pass rate',
      ],
      [
        'unknown',
        { failed: 0, broken: 0, passed: 1, skipped: 0, unknown: 1 },
        'Unknown',
        '1 unknown',
      ],
    ];

    for (const [name, values, heading, detail] of cases) {
      it(name, async () => {
        const total = Object.values(values).reduce((a, b) => a + b, 0);
        const statuses: string[] = [];
        if (values.passed) for (let i = 0; i < values.passed; i++) statuses.push('passed');
        if (values.failed) for (let i = 0; i < values.failed; i++) statuses.push('failed');
        if (values.broken) for (let i = 0; i < values.broken; i++) statuses.push('broken');
        if (values.skipped) for (let i = 0; i < values.skipped; i++) statuses.push('skipped');
        if (values.unknown) for (let i = 0; i < values.unknown; i++) statuses.push('unknown');

        for (let i = 0; i < total; i++) {
          writeResult(`${i}`, { status: statuses[i] });
        }

        writeWidgetSummary({ statistic: { total, ...values } });

        const files = listResultFiles(resultsDir);
        const agg = aggregateResults(files, readJsonSafe, getEpicForResult);
        const widget = await readWidgetSummary(reportDir);
        const summary = mergeSummary(widget, agg);

        const markdown = renderPrComment({
          summary,
          aggregated: agg,
          pagesUrl: '',
          forkPr: false,
          sourceRunId: '',
          actionVersion: '0.1.0',
          commentMarker: '<!-- marker -->',
        });

        expect(markdown).toContain(heading);
        expect(markdown).toContain(detail);
      });
    }
  });

  it('does not drop unknown result when widget reports zero', async () => {
    writeResult('unknown', { status: 'unknown' });
    writeWidgetSummary({
      statistic: { total: 1, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 },
    });
    const files = listResultFiles(resultsDir);
    const agg = aggregateResults(files, readJsonSafe, getEpicForResult);
    const widget = await readWidgetSummary(reportDir);
    const summary = mergeSummary(widget, agg);

    const markdown = renderPrComment({
      summary,
      aggregated: agg,
      pagesUrl: '',
      forkPr: false,
      sourceRunId: '',
      actionVersion: '0.1.0',
      commentMarker: '<!-- mismatch-marker -->',
    });

    expect(markdown).toContain('0 / 1 tests passed · 0% pass rate · 1 unknown');
    expect(markdown).toContain('| 1 | 0 | 0 | 0 | 0 | 1 | — |');
  });
});
