/**
 * Pyramid check command
 */
import { aggregateResults } from '../allure/parser.js';
import { evaluatePyramidQualityGates, writeQualityGatesJson, emitGithubWarning, appendJobSummary, formatQualityGatesMarkdownSection, } from '../renderer/pyramid.js';
/**
 * Executes pyramid-check command
 */
export function runPyramidCheck(options) {
    const { resultsDir, outputJson } = options;
    const aggregated = aggregateResults(resultsDir);
    const { pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal } = aggregated;
    const metrics = {
        pyramidTotal,
        unitShare,
        apiShare,
        e2eShare,
        otherEpicTotal,
    };
    const gates = evaluatePyramidQualityGates(metrics);
    // Emit GitHub warnings
    const titleBase = 'Test pyramid (advisory)';
    for (const warning of gates.warnings) {
        emitGithubWarning(titleBase, `${warning.id}: ${warning.message}`);
    }
    // Write quality gates JSON
    const gateJsonPath = outputJson || 'docs/testing/pyramid-quality-gates.json';
    writeQualityGatesJson(gates, metrics, gateJsonPath);
    // Append to job summary
    const markdown = [];
    markdown.push('### Quality gates — test pyramid (advisory, non-blocking)\n\n');
    markdown.push(formatQualityGatesMarkdownSection(gates, metrics));
    markdown.push('\n');
    appendJobSummary(markdown.join(''));
    console.log(`pyramid-check: ${gates.warnings.length} advisory warning(s), 0 blocking (exit 0).`);
}
//# sourceMappingURL=pyramid-check.js.map