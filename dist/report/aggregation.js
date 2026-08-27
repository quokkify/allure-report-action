/**
 * Report aggregation - aggregates Allure results into report model
 */
import { PYRAMID_LAYERS } from './model.js';
/**
 * Creates an empty test summary
 */
function emptyStats() {
    return { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
}
/**
 * Sums test summaries for a list of epic types
 */
function sumEpicStats(epics, byEpic) {
    const sum = emptyStats();
    for (const epic of epics) {
        const stats = byEpic[epic];
        sum.passed += stats.passed;
        sum.failed += stats.failed;
        sum.broken += stats.broken;
        sum.skipped += stats.skipped;
        sum.unknown += stats.unknown;
        sum.total += stats.total;
    }
    return sum;
}
/**
 * Calculates pass rate percentage
 */
export function calculatePassRate(passed, total) {
    if (!total)
        return '—';
    const pct = (100 * passed) / total;
    const rounded = Math.round(pct * 10) / 10;
    return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}
/**
 * Aggregates Allure results into the report model
 */
export function aggregateResults(files, readJsonFile, getEpicForResult) {
    const byEpic = {
        unit: emptyStats(),
        api: emptyStats(),
        ui: emptyStats(),
        'end-to-end': emptyStats(),
        other: emptyStats(),
    };
    const total = emptyStats();
    let resultCount = 0;
    for (const file of files) {
        const result = readJsonFile(file);
        if (!result || typeof result.status !== 'string')
            continue;
        const status = result.status.toLowerCase();
        const epic = getEpicForResult(result);
        const bucket = byEpic[epic];
        bucket.total++;
        total.total++;
        switch (status) {
            case 'passed':
                bucket.passed++;
                total.passed++;
                break;
            case 'failed':
                bucket.failed++;
                total.failed++;
                break;
            case 'broken':
                bucket.broken++;
                total.broken++;
                break;
            case 'skipped':
                bucket.skipped++;
                total.skipped++;
                break;
            default:
                bucket.unknown++;
                total.unknown++;
        }
        resultCount++;
    }
    // Compute pyramid layers
    const layers = PYRAMID_LAYERS.map(layerDef => ({
        id: layerDef.id,
        label: layerDef.label,
        epics: [...layerDef.epics],
        stats: sumEpicStats([...layerDef.epics], byEpic),
    }));
    const pyramidTotal = layers.reduce((sum, layer) => sum + layer.stats.total, 0);
    const unitStats = layers.find(l => l.id === 'unit')?.stats ?? emptyStats();
    const apiStats = layers.find(l => l.id === 'api')?.stats ?? emptyStats();
    const e2eLayer = layers.find(l => l.id === 'ui_e2e');
    const e2eStats = e2eLayer?.stats ?? emptyStats();
    const other = byEpic.other;
    const otherEpicTotal = other.total;
    return {
        byEpic,
        total,
        resultCount,
        layers,
        otherEpicTotal,
        pyramidTotal,
        unitShare: pyramidTotal ? unitStats.total / pyramidTotal : 0,
        apiShare: pyramidTotal ? apiStats.total / pyramidTotal : 0,
        e2eShare: pyramidTotal ? e2eStats.total / pyramidTotal : 0,
    };
}
//# sourceMappingURL=aggregation.js.map