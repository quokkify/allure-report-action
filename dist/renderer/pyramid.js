/**
 * Pyramid renderer - generates test pyramid markdown and JSON
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PYRAMID_ADVISORY } from '../allure/model.js';
/**
 * Formats epic column for markdown table
 */
function pyramidMarkdownEpicColumn(layer) {
    if (layer.id === 'api')
        return '`api` / `integration`';
    if (layer.id === 'ui_e2e')
        return '`end-to-end` / `ui`';
    return layer.epics.map(e => `\`${e}\``).join(', ');
}
/**
 * Generates advisory notes for pyramid
 */
function pyramidAdvisoryNotes(unitShare, e2eShare, pyramidTotal) {
    if (pyramidTotal === 0) {
        return [
            '- No Allure results in this directory — pyramid share advisory skipped (run tests or point `--results` at merged CI output).',
        ];
    }
    const lines = [];
    if (unitShare < PYRAMID_ADVISORY.unitShareMin) {
        lines.push(`- **Unit share** ${(100 * unitShare).toFixed(1)}% is below the soft planning target (~${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}%+). Consider adding or restoring fast unit tests before expanding API/E2E.`);
    }
    if (e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
        lines.push(`- **UI / E2E share** ${(100 * e2eShare).toFixed(1)}% exceeds the soft ceiling (~${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%). Check whether some cases can move down to API or unit layers.`);
    }
    if (lines.length === 0) {
        lines.push('- Pyramid layer shares sit within the **soft** planning band documented in `docs/testing/test-pyramid.md` (not a merge gate).');
    }
    return lines;
}
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
function formatCountScaledPyramidDiagram(layers) {
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
 * Renders pyramid markdown
 */
export function renderPyramidMarkdown(data) {
    const { aggregated, sourceRunId, headSha, policyPath } = data;
    const { layers, pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal } = aggregated;
    const gates = evaluatePyramidQualityGates({
        pyramidTotal,
        unitShare,
        apiShare,
        e2eShare,
        otherEpicTotal,
    });
    const generatedAt = new Date().toISOString();
    const md = [];
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
        md.push(`| ${L.label} | ${epicCol} | **${s.total}** | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} |`);
    }
    md.push(`| **Σ pyramid layers** | | **${pyramidTotal}** | | | | |`);
    md.push('');
    if (otherEpicTotal > 0) {
        md.push(`> **No epic assigned:** ${otherEpicTotal} case(s) — assign \`epic\` in Vitest/pytest/Playwright setup so they roll into the pyramid.`);
        md.push('');
    }
    md.push('## Shares (pyramid layers only)');
    md.push('');
    if (pyramidTotal === 0) {
        md.push('_No results in the given directory — nothing to chart._');
    }
    else {
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
    md.push(formatQualityGatesMarkdownSection(gates, {
        pyramidTotal,
        unitShare,
        apiShare,
        e2eShare,
        otherEpicTotal,
    }));
    if (policyPath) {
        const policyHref = path
            .relative(path.resolve(path.dirname('')), path.resolve(policyPath))
            .split(path.sep)
            .join('/');
        md.push(`Canonical policy: [\`${policyPath}\`](${policyHref}).`);
    }
    return md.join('\n');
}
/**
 * Generates pyramid JSON payload
 */
export function generatePyramidJson(data) {
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
export function writePyramidFiles(markdown, json, markdownPath, jsonPath) {
    fs.mkdirSync(path.dirname(markdownPath), { recursive: true });
    fs.writeFileSync(markdownPath, markdown, 'utf8');
    console.log(`Wrote ${markdownPath}`);
    if (jsonPath) {
        fs.mkdirSync(path.dirname(jsonPath), { recursive: true });
        fs.writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');
        console.log(`Wrote ${jsonPath}`);
    }
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
//# sourceMappingURL=pyramid.js.map