/**
 * Pyramid renderer - generates test pyramid markdown and JSON
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AggregatedResults, LayerSummary, PYRAMID_ADVISORY } from '../report/index.js';
import {
  evaluatePyramidQualityGates,
  formatQualityGatesMarkdownSection,
  formatCountScaledPyramidDiagram,
} from '../report/quality-gates.js';

export interface PyramidData {
  aggregated: AggregatedResults;
  sourceRunId?: string;
  headSha?: string;
  policyPath?: string;
  outputMd?: string;
}

export interface PyramidMetrics {
  pyramidTotal: number;
  unitShare: number;
  apiShare: number;
  e2eShare: number;
  otherEpicTotal: number;
}

export interface QualityGateWarning {
  id: string;
  message: string;
}

export interface QualityGates {
  blockingFailures: { id: string; message: string }[];
  warnings: QualityGateWarning[];
  advisoryOnly: boolean;
  thresholds: typeof PYRAMID_ADVISORY;
}

export interface QualityGateWarning {
  id: string;
  message: string;
}

/**
 * Formats epic column for markdown table
 */
function pyramidMarkdownEpicColumn(layer: LayerSummary): string {
  if (layer.id === 'api') return '`api` / `integration`';
  if (layer.id === 'ui_e2e') return '`end-to-end` / `ui`';
  return layer.epics.map(e => `\`${e}\``).join(', ');
}

/**
 * Generates advisory notes for pyramid
 */
function pyramidAdvisoryNotes(unitShare: number, e2eShare: number, pyramidTotal: number): string[] {
  if (pyramidTotal === 0) {
    return [
      '- No Allure results in this directory — pyramid share advisory skipped (run tests or point `--results` at merged CI output).',
    ];
  }
  const lines: string[] = [];
  if (unitShare < PYRAMID_ADVISORY.unitShareMin) {
    lines.push(
      `- **Unit share** ${(100 * unitShare).toFixed(1)}% is below the soft planning target (~${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}%+). Consider adding or restoring fast unit tests before expanding API/E2E.`
    );
  }
  if (e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
    lines.push(
      `- **UI / E2E share** ${(100 * e2eShare).toFixed(1)}% exceeds the soft ceiling (~${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%). Check whether some cases can move down to API or unit layers.`
    );
  }
  if (lines.length === 0) {
    lines.push(
      '- Pyramid layer shares sit within the **soft** planning band documented in `docs/testing/test-pyramid.md` (not a merge gate).'
    );
  }
  return lines;
}

/**
 * Renders pyramid markdown
 */
export function renderPyramidMarkdown(data: PyramidData): string {
  const { aggregated, sourceRunId, headSha, policyPath, outputMd } = data;
  const { layers, pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal } = aggregated;
  const gates = evaluatePyramidQualityGates({
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal,
  });

  const generatedAt = new Date().toISOString();
  const md: string[] = [];

  md.push('# Test pyramid snapshot');
  md.push('');
  md.push(`_Generated: \`${generatedAt}\`_`);
  if (sourceRunId) {
    md.push(`_Source workflow run id: \`${sourceRunId}\`_`);
  }
  if (headSha) {
    md.push(`_Head SHA: \`${headSha.slice(0, 7)}\`_`);
  }
  md.push('');
  md.push('## Counts by layer (`epic` / Allure `layer`)');
  md.push('');
  md.push('| Layer | `epic` / `layer` | Cases | Passed | Failed | Broken | Skipped |');
  md.push('| --- | --- | --: | --: | --: | --: | --: |');
  for (const L of layers) {
    const s = L.stats;
    const epicCol = pyramidMarkdownEpicColumn(L);
    md.push(
      `| ${L.label} | ${epicCol} | **${s.total}** | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} |`
    );
  }
  md.push(`| **Σ pyramid layers** | | **${pyramidTotal}** | | | | |`);
  md.push('');

  if (otherEpicTotal > 0) {
    md.push(
      `> **No epic assigned:** ${otherEpicTotal} case(s) — assign \`epic\` in Vitest/pytest/Playwright setup so they roll into the pyramid.`
    );
    md.push('');
  }

  md.push('## Shares (pyramid layers only)');
  md.push('');
  if (pyramidTotal === 0) {
    md.push('_No results in the given directory — nothing to chart._');
  } else {
    md.push('| Layer | Share of Σ layers |');
    md.push('| --- | ---: |');
    for (const L of layers) {
      const pct = (100 * L.stats.total) / pyramidTotal;
      md.push(`| ${L.label} | ${pct.toFixed(1)}% |`);
    }
    md.push('');
    md.push('```text');
    md.push(...formatCountScaledPyramidDiagram(layers));
    md.push('```');
  }
  md.push('');

  md.push('## Advisory (planning only)');
  md.push('');
  md.push(...pyramidAdvisoryNotes(unitShare, e2eShare, pyramidTotal));
  md.push('');

  md.push(
    formatQualityGatesMarkdownSection(gates, {
      pyramidTotal,
      unitShare,
      apiShare,
      e2eShare,
      otherEpicTotal,
    })
  );

  if (policyPath && outputMd) {
    const policyHref = path
      .relative(path.resolve(path.dirname(outputMd)), path.resolve(policyPath))
      .split(path.sep)
      .join('/');
    md.push(`Canonical policy: [\`${policyPath}\`](${policyHref}).`);
  }

  return md.join('\n');
}

/**
 * Generates pyramid JSON payload
 */
export function generatePyramidJson(data: PyramidData): object {
  const { aggregated, sourceRunId, headSha } = data;
  const { layers, pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal, total } = aggregated;
  const gates = evaluatePyramidQualityGates({
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal,
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: {
      workflowRunId: sourceRunId || null,
      headSha: headSha || null,
    },
    pyramidLayerTotals: Object.fromEntries(layers.map(L => [L.id, L.stats.total])),
    pyramidTotal,
    otherEpicTotal,
    allureGrandTotal: total.total,
    shares: pyramidTotal
      ? { unit: unitShare, api: apiShare, ui_e2e: e2eShare }
      : { unit: 0, api: 0, ui_e2e: 0 },
    advisory: { ...PYRAMID_ADVISORY },
    qualityGates: {
      advisoryOnly: gates.advisoryOnly,
      warnings: gates.warnings,
      blockingFailures: gates.blockingFailures,
    },
  };
}

/**
 * Writes pyramid files
 */
export function writePyramidFiles(
  markdown: string,
  json: object,
  markdownPath: string,
  jsonPath: string
): void {
  fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
  fs.writeFileSync(markdownPath, markdown, 'utf8');
  console.log(`Wrote ${markdownPath}`);

  if (jsonPath) {
    fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
    fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
    console.log(`Wrote ${jsonPath}`);
  }
}
