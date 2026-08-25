/**
 * Tests for Allure parser
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  listResultFiles,
  readJsonSafe,
  getLabelValue,
  getEpicForResult,
  aggregateResults,
  calculatePassRate,
} from '../../src/allure/parser.js';

describe('Allure Parser', () => {
  let tempDir: string;
  let resultsDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'allure-parser-test-'));
    resultsDir = path.join(tempDir, 'results');
    fs.mkdirSync(resultsDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const writeResult = (name: string, data: object) => {
    fs.writeFileSync(path.join(resultsDir, `${name}-result.json`), JSON.stringify(data));
  };

  describe('listResultFiles', () => {
    it('returns empty array for non-existent directory', () => {
      const files = listResultFiles('/non/existent/path');
      expect(files).toEqual([]);
    });

    it('lists only -result.json files', () => {
      writeResult('test1', { uuid: '1', status: 'passed' });
      writeResult('test2', { uuid: '2', status: 'failed' });
      fs.writeFileSync(path.join(resultsDir, 'other.txt'), 'not a result');

      const files = listResultFiles(resultsDir);
      expect(files).toHaveLength(2);
      expect(files.every(f => f.endsWith('-result.json'))).toBe(true);
    });
  });

  describe('readJsonSafe', () => {
    it('parses valid JSON', () => {
      const file = path.join(resultsDir, 'test.json');
      fs.writeFileSync(file, '{"key": "value"}');
      const result = readJsonSafe(file);
      expect(result).toEqual({ key: 'value' });
    });

    it('returns null for invalid JSON', () => {
      const file = path.join(resultsDir, 'test.json');
      fs.writeFileSync(file, 'invalid json');
      const result = readJsonSafe(file);
      expect(result).toBeNull();
    });

    it('returns null for non-existent file', () => {
      const result = readJsonSafe('/non/existent.json');
      expect(result).toBeNull();
    });
  });

  describe('getLabelValue', () => {
    it('returns label value when found', () => {
      const labels = [
        { name: 'epic', value: 'unit' },
        { name: 'layer', value: 'api' },
      ];
      expect(getLabelValue(labels, 'epic')).toBe('unit');
      expect(getLabelValue(labels, 'layer')).toBe('api');
    });

    it('returns empty string when label not found', () => {
      const labels = [{ name: 'epic', value: 'unit' }];
      expect(getLabelValue(labels, 'feature')).toBe('');
    });

    it('returns empty string for undefined labels', () => {
      expect(getLabelValue(undefined, 'epic')).toBe('');
    });

    it('trims whitespace', () => {
      const labels = [{ name: 'epic', value: '  unit  ' }];
      expect(getLabelValue(labels, 'epic')).toBe('unit');
    });
  });

  describe('getEpicForResult', () => {
    it('returns epic from label when recognized', () => {
      const result = { labels: [{ name: 'epic', value: 'unit' }] };
      expect(getEpicForResult(result)).toBe('unit');
    });

    it("returns 'other' for unrecognized epic", () => {
      const result = { labels: [{ name: 'epic', value: 'custom' }] };
      expect(getEpicForResult(result)).toBe('other');
    });

    it("returns 'end-to-end' for Playwright framework", () => {
      const result = { labels: [{ name: 'framework', value: 'playwright' }] };
      expect(getEpicForResult(result)).toBe('end-to-end');
    });

    it("returns 'other' when no labels", () => {
      const result = { labels: [] };
      expect(getEpicForResult(result)).toBe('other');
    });

    it("returns 'other' when labels is undefined", () => {
      const result = {};
      expect(getEpicForResult(result)).toBe('other');
    });
  });

  describe('aggregateResults', () => {
    it('aggregates results by epic', () => {
      writeResult('unit1', {
        uuid: '1',
        status: 'passed',
        labels: [{ name: 'epic', value: 'unit' }],
      });
      writeResult('unit2', {
        uuid: '2',
        status: 'passed',
        labels: [{ name: 'epic', value: 'unit' }],
      });
      writeResult('api1', {
        uuid: '3',
        status: 'failed',
        labels: [{ name: 'epic', value: 'api' }],
      });
      writeResult('e2e1', {
        uuid: '4',
        status: 'passed',
        labels: [{ name: 'epic', value: 'end-to-end' }],
      });
      writeResult('plain', { uuid: '5', status: 'passed' }); // no epic
      writeResult('playwright', {
        uuid: '6',
        status: 'passed',
        labels: [{ name: 'framework', value: 'playwright' }],
      });

      const agg = aggregateResults(resultsDir);

      expect(agg.total.total).toBe(6);
      expect(agg.total.passed).toBe(5);
      expect(agg.total.failed).toBe(1);
      expect(agg.byEpic.unit.total).toBe(2);
      expect(agg.byEpic.unit.passed).toBe(2);
      expect(agg.byEpic.api.total).toBe(1);
      expect(agg.byEpic.api.failed).toBe(1);
      expect(agg.byEpic['end-to-end'].total).toBe(2); // e2e + playwright
      expect(agg.byEpic.other.total).toBe(1);
    });

    it('handles empty results directory', () => {
      const agg = aggregateResults(resultsDir);
      expect(agg.total.total).toBe(0);
      expect(agg.resultCount).toBe(0);
    });
  });

  describe('calculatePassRate', () => {
    it('calculates pass rate correctly', () => {
      expect(calculatePassRate(10, 10)).toBe('100%');
      expect(calculatePassRate(5, 10)).toBe('50%');
      expect(calculatePassRate(1, 3)).toBe('33.3%');
      expect(calculatePassRate(0, 10)).toBe('0%');
    });

    it('returns em dash for zero total', () => {
      expect(calculatePassRate(0, 0)).toBe('—');
    });
  });
});
