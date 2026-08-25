/**
 * Quality gates - evaluates test pyramid quality gates
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PYRAMID_ADVISORY } from './model.js';
/**
 * Evaluates pyramid quality gates
 */
export function evaluatePyramidQualityGates(metrics) {
    const warnings = [];
    const blockingFailures = [];
    if (metrics.pyramidTotal > 0) {
        if (metrics.unitShare < PYRAMID_ADVISORY.unitShareMin) {
            warnings.push({
                id: 'PYRAMID_UNIT_SHARE_LOW',
                message: `Unit share ${(100 * metrics.unitShare).toFixed(1)}% is below soft target ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% (see docs/testing/test-pyramid.md).`,
            });
        }
        if (metrics.e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
            warnings.push({
                id: 'PYRAMID_E2E_SHARE_HIGH',
                message: `UI/E2E share ${(100 * metrics.e2eShare).toFixed(1)}% exceeds soft ceiling ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%.`,
            });
        }
    }
    if (metrics.otherEpicTotal > 0) {
        warnings.push({
            id: 'PYRAMID_UNKNOWN_EPIC',
            message: `${metrics.otherEpicTotal} test(s) lack a known Allure epic — assign epic in Vitest/pytest/Playwright so they count toward the pyramid.`,
        });
    }
    return {
        blockingFailures,
        warnings,
        advisoryOnly: true,
        thresholds: { ...PYRAMID_ADVISORY },
    };
}
/**
 * Formats quality gates as markdown section
 */
export function formatQualityGatesMarkdownSection(gates, metrics) {
    const lines = [];
    lines.push('## Quality gates (non-blocking, advisory)');
    lines.push('');
    lines.push('These checks **never fail the workflow**; they surface in GitHub **Annotations** (warnings) and in the **Job summary** when `pyramid-check` runs (Test Report workflow).');
    lines.push('');
    if (metrics.pyramidTotal === 0) {
        lines.push('| Check | Status |');
        lines.push('| --- | --- |');
        lines.push('| Pyramid layer totals | ⚠️ skipped (no `unit`/`api`/`end-to-end`/`ui` cases in merged results) |');
        lines.push('');
        if (metrics.otherEpicTotal > 0) {
            lines.push(`**Note:** ${metrics.otherEpicTotal} test(s) use an unknown or unsupported \`epic\` — they do not count toward Σ pyramid layers until labels are fixed.`);
            lines.push('');
        }
        return lines.join('\n');
    }
    lines.push('| Gate id | Status | Detail |');
    lines.push('| --- | --- | --- |');
    const warnIds = new Set(gates.warnings.map(w => w.id));
    lines.push(`| PYRAMID_UNIT_SHARE_LOW | ${warnIds.has('PYRAMID_UNIT_SHARE_LOW') ? '⚠️ warning' : '✓ ok'} | unit ≥ ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% of Σ layers (actual ${(100 * metrics.unitShare).toFixed(1)}%) |`);
    lines.push(`| PYRAMID_E2E_SHARE_HIGH | ${warnIds.has('PYRAMID_E2E_SHARE_HIGH') ? '⚠️ warning' : '✓ ok'} | UI/E2E ≤ ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}% of Σ layers (actual ${(100 * metrics.e2eShare).toFixed(1)}%) |`);
    lines.push(`| PYRAMID_UNKNOWN_EPIC | ${warnIds.has('PYRAMID_UNKNOWN_EPIC') ? '⚠️ warning' : '✓ ok'} | no epic assigned: ${metrics.otherEpicTotal} |`);
    lines.push('');
    lines.push('_Blocking failures: none (reserved for a future strict mode)._');
    lines.push('');
    return lines.join('\n');
}
/**
 * Formats count-scaled pyramid diagram
 */
export function formatCountScaledPyramidDiagram(layers) {
    const byId = Object.fromEntries(layers.map(L => [L.id, L]));
    const rows = ['ui_e2e', 'api', 'unit']
        .map(id => byId[id])
        .filter((layer) => layer !== undefined);
    const maxVisualWidth = 28;
    const maxTotal = Math.max(...rows.map(L => L.stats.total), 1);
    const legendWidth = Math.max(...layers.map(L => L.label.length));
    const countWidth = Math.max(5, ...layers.map(L => String(L.stats.total).length));
    const diagramIndent = 6;
    const lines = [];
    for (const layer of rows) {
        const visualWidth = Math.max(1, Math.round((maxVisualWidth * layer.stats.total) / maxTotal));
        const leftPad = Math.floor((maxVisualWidth - visualWidth) / 2);
        const blocks = `${' '.repeat(leftPad)}${'█'.repeat(visualWidth)}`;
        lines.push(`${layer.label.padEnd(legendWidth)} ${String(layer.stats.total).padStart(countWidth)}${' '.repeat(diagramIndent)}${blocks}`);
    }
    return lines;
}
/**
 * Writes quality gates JSON
 */
export function writeQualityGatesJson(gates, metrics, outputPath) {
    const payload = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        advisoryOnly: true,
        exitCodePolicy: 'always_zero',
        gates,
        metrics: {
            pyramidTotal: metrics.pyramidTotal,
            unitShare: metrics.unitShare,
            apiShare: metrics.apiShare,
            e2eShare: metrics.e2eShare,
            otherEpicTotal: metrics.otherEpicTotal,
        },
    };
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');
    console.log(`Wrote ${outputPath}`);
}
/**
 * Emits GitHub workflow warning annotation
 */
function githubWorkflowEscape(s) {
    return String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
export function emitGithubWarning(title, message) {
    console.log(`::warning title=${githubWorkflowEscape(title)}::${githubWorkflowEscape(message)}`);
}
/**
 * Appends to GitHub job summary
 */
export function appendJobSummary(markdown) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (!summaryPath)
        return;
    fs.appendFileSync(summaryPath, markdown, 'utf8');
}
//# sourceMappingURL=quality-gates.js.map