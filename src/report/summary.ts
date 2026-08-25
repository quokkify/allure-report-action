/**
 * Report summary - reads and processes Allure widget summary
 */
import { AggregatedResults, TestSummary } from './model.js';

export interface WidgetSummary {
  statistic?: TestSummary;
}

/**
 * Reads widget summary from Allure report
 */
export async function readWidgetSummary(reportDir: string): Promise<WidgetSummary | null> {
  try {
    const fs = await import('node:fs');
    const path = await import('node:path');
    return JSON.parse(
      fs.readFileSync(path.join(reportDir, 'widgets', 'summary.json'), 'utf8')
    ) as WidgetSummary;
  } catch {
    return null;
  }
}

/**
 * Merges widget summary with aggregated results
 * Widget summary is the source of truth for counts, but aggregated results
 * may have additional info (like unknown results that widget omits)
 */
export function mergeSummary(
  widget: WidgetSummary | null,
  aggregated: AggregatedResults
): TestSummary {
  if (!widget?.statistic) return aggregated.total;

  const stat = widget.statistic;
  return {
    total: stat.total ?? aggregated.total.total,
    passed: stat.passed ?? 0,
    failed: stat.failed ?? 0,
    broken: stat.broken ?? 0,
    skipped: stat.skipped ?? 0,
    unknown: Math.max(stat.unknown ?? 0, aggregated.total.unknown),
  };
}
