/**
 * Tests for Pyramid renderer
 */
import { describe, it, expect } from 'vitest';
import {
  renderPyramidMarkdown,
  generatePyramidJson,
  evaluatePyramidQualityGates,
} from '../../src/renderer/pyramid.js';
import { AggregatedResults, TestSummary, emptyStats } from '../../src/allure/model.js';

describe('Pyramid Renderer', () => {
  const createMockAggregated = (overrides: Partial<AggregatedResults> = {}): AggregatedResults => {
    const base: AggregatedResults = {
      byEpic: {
        unit: { ...emptyStats(), total: 100, passed: 95, failed: 5 },
        api: { ...emptyStats(), total: 30, passed: 28, failed: 2 },
        ui: { ...emptyStats(), total: 10, passed: 9, failed: 1 },
        'end-to-end': { ...emptyStats(), total: 10, passed: 9, failed: 1 },
        other: { ...emptyStats(), total: 5, passed: 5 },
      },
      total: { ...emptyStats(), total: 155, passed: 146, failed: 9 },
      resultCount: 155,
      layers: [
        {
          id: 'unit',
          label: 'Unit (base)',
          epics: ['unit'],
          stats: { ...emptyStats(), total: 100, passed: 95, failed: 5 },
        },
        {
          id: 'api',
          label: 'Integration (middle)',
          epics: ['api'],
          stats: { ...emptyStats(), total: 30, passed: 28, failed: 2 },
        },
        {
          id: 'ui_e2e',
          label: 'UI / E2E (top)',
          epics: ['ui', 'end-to-end'],
          stats: { ...emptyStats(), total: 20, passed: 18, failed: 2 },
        },
      ],
      otherEpicTotal: 5,
      pyramidTotal: 150,
      unitShare: 100 / 150,
      apiShare: 30 / 150,
      e2eShare: 20 / 150,
    };
    return { ...base, ...overrides };
  };

  describe('renderPyramidMarkdown', () => {
    it('renders complete pyramid markdown', () => {
      const markdown = renderPyramidMarkdown({
        aggregated: createMockAggregated(),
        sourceRunId: '12345',
        headSha: 'abcdef123456',
        policyPath: 'docs/testing/test-pyramid.md',
        outputMd: 'docs/testing/pyramid-snapshot.md',
      });

      expect(markdown).toContain('# Test pyramid snapshot');
      expect(markdown).toContain('Source workflow run id: `12345`');
      expect(markdown).toContain('Head SHA: `abcdef1`');
      expect(markdown).toContain('## Counts by layer');
      expect(markdown).toContain('| Unit (base) | `unit` | **100** | 95 | 5 | 0 | 0 |');
      expect(markdown).toContain(
        '| Integration (middle) | `api` / `integration` | **30** | 28 | 2 | 0 | 0 |'
      );
      expect(markdown).toContain(
        '| UI / E2E (top) | `end-to-end` / `ui` | **20** | 18 | 2 | 0 | 0 |'
      );
      expect(markdown).toContain('**Σ pyramid layers**');
      expect(markdown).toContain('150');
      expect(markdown).toContain('## Shares (pyramid layers only)');
      expect(markdown).toContain('66.7%'); // unit share
      expect(markdown).toContain('20.0%'); // api share
      expect(markdown).toContain('13.3%'); // e2e share
      expect(markdown).toContain('```text');
      expect(markdown).toContain('█'); // diagram blocks
      expect(markdown).toContain('## Advisory (planning only)');
      expect(markdown).toContain('Quality gates (non-blocking, advisory)');
      expect(markdown).toContain('Canonical policy');
    });

    it('handles zero pyramid totals', () => {
      const markdown = renderPyramidMarkdown({
        aggregated: createMockAggregated({
          layers: [
            { id: 'unit', label: 'Unit (base)', epics: ['unit'], stats: emptyStats() },
            { id: 'api', label: 'Integration (middle)', epics: ['api'], stats: emptyStats() },
            {
              id: 'ui_e2e',
              label: 'UI / E2E (top)',
              epics: ['ui', 'end-to-end'],
              stats: emptyStats(),
            },
          ],
          pyramidTotal: 0,
          unitShare: 0,
          apiShare: 0,
          e2eShare: 0,
        }),
      });

      expect(markdown).toContain('No results in the given directory — nothing to chart.');
      expect(markdown).toContain('pyramid share advisory skipped');
    });

    it('shows warning for unknown epic', () => {
      const markdown = renderPyramidMarkdown({
        aggregated: createMockAggregated({ otherEpicTotal: 10 }),
      });

      expect(markdown).toContain('> **No epic assigned:** 10 case(s)');
      expect(markdown).toContain('assign `epic` in Vitest/pytest/Playwright');
    });
  });

  describe('generatePyramidJson', () => {
    it('generates correct JSON structure', () => {
      const json = generatePyramidJson({
        aggregated: createMockAggregated(),
        sourceRunId: '12345',
        headSha: 'abcdef123456',
      });

      expect(json).toMatchObject({
        schemaVersion: 1,
        source: { workflowRunId: '12345', headSha: 'abcdef123456' },
        pyramidLayerTotals: { unit: 100, api: 30, ui_e2e: 20 },
        pyramidTotal: 150,
        otherEpicTotal: 5,
        allureGrandTotal: 155,
        shares: { unit: 100 / 150, api: 30 / 150, ui_e2e: 20 / 150 },
        advisory: { unitShareMin: 0.45, e2eShareMax: 0.28 },
        qualityGates: { advisoryOnly: true },
      });
      expect(json).toHaveProperty('generatedAt');
    });
  });

  describe('evaluatePyramidQualityGates', () => {
    it('passes when shares are within thresholds', () => {
      const gates = evaluatePyramidQualityGates({
        pyramidTotal: 100,
        unitShare: 0.5, // 50% >= 45%
        apiShare: 0.3,
        e2eShare: 0.2, // 20% <= 28%
        otherEpicTotal: 0,
      });

      expect(gates.warnings).toHaveLength(0);
      expect(gates.blockingFailures).toHaveLength(0);
      expect(gates.advisoryOnly).toBe(true);
    });

    it('warns when unit share is too low', () => {
      const gates = evaluatePyramidQualityGates({
        pyramidTotal: 100,
        unitShare: 0.4, // 40% < 45%
        apiShare: 0.3,
        e2eShare: 0.2, // 20% <= 28% to avoid e2e warning
        otherEpicTotal: 0,
      });

      expect(gates.warnings).toHaveLength(1);
      expect(gates.warnings[0].id).toBe('PYRAMID_UNIT_SHARE_LOW');
      expect(gates.warnings[0].message).toContain('40.0%');
      expect(gates.warnings[0].message).toContain('45%');
    });

    it('warns when e2e share is too high', () => {
      const gates = evaluatePyramidQualityGates({
        pyramidTotal: 100,
        unitShare: 0.4,
        apiShare: 0.3,
        e2eShare: 0.3, // 30% > 28%
        otherEpicTotal: 0,
      });

      expect(gates.warnings).toHaveLength(2);
      expect(gates.warnings.some(w => w.id === 'PYRAMID_E2E_SHARE_HIGH')).toBe(true);
    });

    it('warns for unknown epic', () => {
      const gates = evaluatePyramidQualityGates({
        pyramidTotal: 100,
        unitShare: 0.5,
        apiShare: 0.3,
        e2eShare: 0.2,
        otherEpicTotal: 5,
      });

      expect(gates.warnings.some(w => w.id === 'PYRAMID_UNKNOWN_EPIC')).toBe(true);
      expect(gates.warnings.find(w => w.id === 'PYRAMID_UNKNOWN_EPIC')?.message).toContain('5');
    });
  });
});
