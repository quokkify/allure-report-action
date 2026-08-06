#!/usr/bin/env node
/**
 * Allure — Shields JSON under allure-report/badges/, PR comment body, and optional test pyramid export.
 * The caller-provided hidden marker is used to upsert the bot comment.
 * README table markers: `<!-- CSP_PYRAMID_TABLE_START -->` … `<!-- CSP_PYRAMID_TABLE_END -->`.
 * Run from the repository root, for example:
 *
 *   node allure-ci.mjs badges --results allure-results --out allure-report
 *   node allure-ci.mjs pr-body --results allure-results --report allure-report \
 *     --output allure-pr-comment.md --pages-url "https://..." --fork-pr false
 *   node allure-ci.mjs pyramid --results allure-results \
 *     --output docs/testing/pyramid-snapshot.md --json docs/testing/pyramid-snapshot.json [--readme README.md]
 *   node allure-ci.mjs pyramid-check --results allure-results [--json docs/testing/pyramid-quality-gates.json]
 *     (GitHub ::warning:: + job summary; exit 0 always — non-blocking quality gate)
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const EPICS = ["unit", "api", "ui", "end-to-end"];
const ACTION_REPOSITORY_URL = "https://github.com/quokkify/allure-report-action";

/** Pyramid export: base → middle → top (Allure epics). */
const PYRAMID_LAYERS = [
  { id: "unit", epics: ["unit"], label: "Unit (base)", epicNote: "`unit`" },
  {
    id: "api",
    epics: ["api"],
    label: "Integration (middle)",
    epicNote: "`epic: api`, Allure `layer: integration`",
  },
  {
    id: "ui_e2e",
    epics: ["end-to-end", "ui"],
    label: "UI / E2E (top)",
    epicNote: "`end-to-end` (+ `ui` if used)",
  },
];

/** Markdown for README / snapshot “epic(s)” column: slash-separated `epic` / `layer` (or two epics for UI). */
function pyramidMarkdownEpicColumn(L) {
  if (L.id === "api") return "`api` / `integration`";
  if (L.id === "ui_e2e") return "`end-to-end` / `ui`";
  return L.epics.map((e) => `\`${e}\``).join(", ");
}

/** Soft planning targets (shares of pyramid-layer totals); advisory quality gates only. */
const PYRAMID_ADVISORY = {
  unitShareMin: 0.45,
  e2eShareMax: 0.28,
};

/** PR comment: human-readable layer names (Allure `epic` label values). */
const EPIC_DISPLAY = {
  unit: "Unit",
  api: "Integration",
  ui: "UI",
  "end-to-end": "E2E",
  other: "No epic assigned",
};

function bundledActionVersion() {
  try {
    return fs.readFileSync(new URL("./version.txt", import.meta.url), "utf8").trim();
  } catch {
    return "";
  }
}

function displayActionVersion(version) {
  const normalized = String(version || "").trim();
  if (!normalized) return "unversioned";
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function listResultFiles(resultsDir) {
  if (!fs.existsSync(resultsDir)) return [];
  return fs
    .readdirSync(resultsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith("-result.json"))
    .map((e) => path.join(resultsDir, e.name));
}

const MODULE_SOURCE_SKIP_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".venv",
  "allure-report",
  "dist",
  "node_modules",
  "venv",
]);

function moduleFromFragment(fragmentPath) {
  const modules = new Set();
  for (const rawLine of fs.readFileSync(fragmentPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if ((key === "Module" || key.endsWith(".Module")) && value) modules.add(value);
  }
  if (modules.size > 1) {
    throw new Error(
      `Conflicting module values in ${fragmentPath}: ${[...modules].sort().join(", ")}`,
    );
  }
  return [...modules][0] || "";
}

function findModuleSourceDirectories(sourceRoot, resultsDir) {
  const root = path.resolve(sourceRoot);
  const destination = path.resolve(resultsDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];

  const sources = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === destination) continue;
    const fragment = path.join(directory, "ci-env-fragment.properties");
    if (fs.existsSync(fragment) && fs.statSync(fragment).isFile()) {
      sources.push({ directory, fragment });
      continue;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (MODULE_SOURCE_SKIP_DIRECTORIES.has(entry.name)) continue;
      stack.push(path.join(directory, entry.name));
    }
  }
  return sources.sort((left, right) => left.directory.localeCompare(right.directory));
}

let atomicWriteSequence = 0;
function writeJsonAtomic(file, document) {
  atomicWriteSequence += 1;
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${atomicWriteSequence}.tmp`,
  );
  const mode = fs.statSync(file).mode & 0o777;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(document)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode,
    });
    fs.renameSync(temporary, file);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

function recoverModuleLabels(resultsDir, sourceRoot, moduleLabel) {
  const provenance = new Map();
  let sourceDirectories = 0;
  for (const { directory, fragment } of findModuleSourceDirectories(sourceRoot, resultsDir)) {
    const moduleName = moduleFromFragment(fragment);
    if (!moduleName) continue;
    sourceDirectories += 1;
    for (const sourceResult of listResultFiles(directory)) {
      const basename = path.basename(sourceResult);
      const previous = provenance.get(basename);
      if (previous && previous !== moduleName) {
        throw new Error(
          `Conflicting module provenance for ${basename}: ${previous} and ${moduleName}`,
        );
      }
      provenance.set(basename, moduleName);
    }
  }

  let recovered = 0;
  for (const resultFile of listResultFiles(resultsDir)) {
    const moduleName = provenance.get(path.basename(resultFile));
    if (!moduleName) continue;
    const document = readJsonSafe(resultFile);
    if (!document || typeof document !== "object" || Array.isArray(document)) continue;
    if (labelValue(document.labels, moduleLabel)) continue;
    if (document.labels !== undefined && !Array.isArray(document.labels)) continue;
    document.labels = Array.isArray(document.labels) ? document.labels : [];
    document.labels.push({ name: moduleLabel, value: moduleName });
    writeJsonAtomic(resultFile, document);
    recovered += 1;
  }
  return { recovered, sourceDirectories };
}

function labelValue(labels, name) {
  if (!Array.isArray(labels)) return "";
  const label = labels.find((item) => item && item.name === name && item.value);
  return label ? String(label.value).trim() : "";
}

function normalizedModuleTokens(value) {
  return String(value || "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token && token !== "utils");
}

function moduleVariableParts(key) {
  const index = key.lastIndexOf(".");
  if (index <= 0 || index === key.length - 1) return null;
  return {
    moduleTokens: normalizedModuleTokens(key.slice(0, index)),
    name: key.slice(index + 1).trim(),
  };
}

function tokensEqual(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}

function tokensEndWith(longer, shorter) {
  if (shorter.length === 0 || longer.length < shorter.length) return false;
  const offset = longer.length - shorter.length;
  return shorter.every((token, index) => longer[offset + index] === token);
}

function environmentId(value, used) {
  const base =
    String(value || "")
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 52) || "module";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 52 - String(suffix).length - 1)}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

async function cmdModuleConfig(resultsDir, sourceRoot, configFile, outputFile, moduleLabel) {
  if (!moduleLabel.trim()) {
    throw new Error("--module-label must not be empty");
  }
  const configPath = path.resolve(configFile);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Allure config not found: ${configFile}`);
  }

  const provenance = recoverModuleLabels(resultsDir, sourceRoot, moduleLabel);
  if (provenance.sourceDirectories > 0) {
    process.stdout.write(
      `Recovered module labels for ${provenance.recovered} result(s) from ${provenance.sourceDirectories} source directories\n`,
    );
  }

  const moduleNames = new Set();
  let unmatchedResults = 0;
  for (const file of listResultFiles(resultsDir)) {
    const doc = readJsonSafe(file);
    const moduleName = labelValue(doc?.labels, moduleLabel);
    if (moduleName) moduleNames.add(moduleName);
    else unmatchedResults += 1;
  }

  const configUrl = pathToFileURL(configPath).href;
  const baseConfigModule = await import(configUrl);
  const baseConfig = baseConfigModule.default || {};
  const allVariables = { ...(baseConfig.variables || {}) };
  for (const descriptor of Object.values(baseConfig.environments || {})) {
    Object.assign(allVariables, descriptor?.variables || {});
  }
  if (moduleNames.size > 0) {
    for (const [key, value] of Object.entries(allVariables)) {
      if (key.toLowerCase().endsWith(".module") && String(value || "").trim()) {
        moduleNames.add(String(value).trim());
      }
    }
  }
  const names = [...moduleNames].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    const source = `import baseConfig from ${JSON.stringify(configUrl)};\nexport default baseConfig;\n`;
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    fs.writeFileSync(outputFile, source, "utf8");
    process.stdout.write(
      `No ${moduleLabel} labels found; preserved caller environments in ${outputFile}\n`,
    );
    return;
  }

  const usedIds = new Set(["default"]);
  const modules = names.map((name) => ({
    id: environmentId(name, usedIds),
    name,
    tokens: normalizedModuleTokens(name),
    variables: {},
  }));
  const globalVariables = {};
  for (const [key, value] of Object.entries(allVariables)) {
    const parts = moduleVariableParts(key);
    const exactMatches = parts
      ? modules.filter((candidate) => tokensEqual(candidate.tokens, parts.moduleTokens))
      : [];
    const suffixMatches =
      parts && exactMatches.length === 0
        ? modules.filter(
            (candidate) =>
              tokensEndWith(candidate.tokens, parts.moduleTokens) ||
              tokensEndWith(parts.moduleTokens, candidate.tokens),
          )
        : [];
    const matches = exactMatches.length > 0 ? exactMatches : suffixMatches;
    const module = matches.length === 1 ? matches[0] : null;
    if (module && parts.name) module.variables[parts.name] = String(value);
    else globalVariables[key] = String(value);
  }

  const serializedModules = modules.map(({ id, name, variables }) => ({ id, name, variables }));
  const source = `import baseConfig from ${JSON.stringify(configUrl)};
const moduleLabel = ${JSON.stringify(moduleLabel)};
const modules = ${JSON.stringify(serializedModules, null, 2)};
const environments = Object.fromEntries(modules.map(({ id, name, variables }) => [id, {
  name,
  variables,
  matcher: ({ labels }) => Array.isArray(labels) && labels.some(
    (label) => label?.name === moduleLabel && String(label?.value || "").trim() === name,
  ),
}]));
export default {
  ...baseConfig,
  variables: ${JSON.stringify(globalVariables, null, 2)},
  environments,
};
`;
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  fs.writeFileSync(outputFile, source, "utf8");
  process.stdout.write(
    `Prepared ${modules.length} module environment(s) from ${moduleLabel}; ${unmatchedResults} result(s) use default environment.\n`,
  );
}

function epicFromLabels(labels) {
  if (!Array.isArray(labels)) return null;
  const epic = labels.find((l) => l && l.name === "epic");
  return epic && epic.value ? String(epic.value).toLowerCase() : null;
}

/** Явный epic из labels, иначе Playwright → end-to-end (merged Allure без runtime epic). */
function epicForResult(doc) {
  const raw = epicFromLabels(doc.labels);
  if (raw && EPICS.includes(raw)) return raw;
  if (!Array.isArray(doc.labels)) return raw;
  const fw = doc.labels.find((l) => l && l.name === "framework");
  if (fw && String(fw.value).toLowerCase() === "playwright") return "end-to-end";
  return raw;
}

function aggregateResults(resultsDir) {
  const files = listResultFiles(resultsDir);
  const byEpic = {};
  for (const e of EPICS) {
    byEpic[e] = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, total: 0 };
  }
  const total = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, total: 0 };

  for (const file of files) {
    const doc = readJsonSafe(file);
    if (!doc || typeof doc.status !== "string") continue;
    const st = doc.status.toLowerCase();
    const rawEpic = epicForResult(doc);
    const epic = rawEpic && EPICS.includes(rawEpic) ? rawEpic : "other";
    if (!byEpic[epic]) {
      byEpic[epic] = { passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0, total: 0 };
    }
    const bucket = byEpic[epic];
    bucket.total++;
    total.total++;
    if (st === "passed") {
      bucket.passed++;
      total.passed++;
    } else if (st === "failed") {
      bucket.failed++;
      total.failed++;
    } else if (st === "broken") {
      bucket.broken++;
      total.broken++;
    } else if (st === "skipped") {
      bucket.skipped++;
      total.skipped++;
    } else {
      bucket.unknown++;
      total.unknown++;
    }
  }

  return { byEpic, total, resultCount: files.length };
}

function shieldJson(label, message, color) {
  return JSON.stringify({ schemaVersion: 1, label, message, color }, null, 0);
}

function colorForStats(s) {
  if (s.failed > 0 || s.broken > 0) return "red";
  if (s.skipped > 0 && s.passed + s.failed + s.broken === 0) return "yellow";
  if (s.passed > 0) return "brightgreen";
  return "lightgrey";
}

function messageForStats(s) {
  if (s.total === 0) return "no tests";
  const parts = [];
  if (s.passed) parts.push(`${s.passed} passed`);
  if (s.failed) parts.push(`${s.failed} failed`);
  if (s.broken) parts.push(`${s.broken} broken`);
  if (s.skipped) parts.push(`${s.skipped} skipped`);
  if (s.unknown) parts.push(`${s.unknown} other`);
  return parts.join(", ") || `${s.total} total`;
}

function cmdBadges(resultsDir, reportDir) {
  const { byEpic, total } = aggregateResults(resultsDir);
  const badgeDir = path.join(reportDir, "badges");
  fs.mkdirSync(badgeDir, { recursive: true });

  fs.writeFileSync(
    path.join(badgeDir, "total.json"),
    shieldJson("all tests", messageForStats(total), colorForStats(total)),
  );

  for (const epic of EPICS) {
    const s = byEpic[epic] || {
      passed: 0,
      failed: 0,
      broken: 0,
      skipped: 0,
      unknown: 0,
      total: 0,
    };
    fs.writeFileSync(
      path.join(badgeDir, `${epic}.json`),
      shieldJson(`${epic} tests`, messageForStats(s), colorForStats(s)),
    );
  }

  process.stdout.write(`Wrote shields JSON to ${badgeDir}\n`);
}

function readWidgetSummary(reportDir) {
  return readJsonSafe(path.join(reportDir, "widgets", "summary.json"));
}

/** @param {{ passed: number, total: number }} s */
function passRatePercent(s) {
  if (!s.total) return "—";
  const pct = (100 * s.passed) / s.total;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

function cmdPrBody(
  resultsDir,
  reportDir,
  outputFile,
  pagesUrl,
  forkPr,
  sourceRunId,
  commentMarker,
  actionVersion,
) {
  const agg = aggregateResults(resultsDir);
  const summary = readWidgetSummary(reportDir);
  const stat = summary && summary.statistic ? summary.statistic : agg.total;
  const total = stat.total ?? agg.total.total;
  const passed = stat.passed ?? 0;
  const failed = stat.failed ?? 0;
  const broken = stat.broken ?? 0;
  const skipped = stat.skipped ?? 0;
  const unknown = stat.unknown ?? agg.total.unknown ?? 0;

  const lines = [];
  lines.push("## Allure report summary");
  lines.push("");
  if (total > 0) {
    const rate = passRatePercent({ passed, total });
    const problems = failed + broken;
    const parts = [`**${total}** tests`, `**${passed}** passed`, `${rate} pass rate`];
    if (problems > 0) parts.push(`**${problems}** failed/broken`);
    if (skipped > 0) parts.push(`**${skipped}** skipped`);
    if (unknown > 0) parts.push(`**${unknown}** unknown`);
    lines.push(parts.join(" · "));
    lines.push("");
  }

  lines.push("### Outcomes (all suites)");
  lines.push("");
  lines.push("| Outcome | Count |");
  lines.push("| --- | --: |");
  lines.push(`| Passed | ${passed} |`);
  lines.push(`| Failed | ${failed} |`);
  lines.push(`| Broken | ${broken} |`);
  lines.push(`| Skipped | ${skipped} |`);
  if (unknown > 0) {
    lines.push(`| Unknown | ${unknown} |`);
  }
  lines.push(`| **Total** | **${total}** |`);
  if (total > 0) {
    lines.push(`| Pass rate (passed / total) | **${passRatePercent({ passed, total })}** |`);
  }
  lines.push("");

  lines.push("<details>");
  lines.push("<summary><strong>By layer</strong> (Allure <code>epic</code> label)</summary>");
  lines.push("");
  lines.push("| Layer | Tests | Passed | Failed | Broken | Skipped | Pass rate |");
  lines.push("| --- | --: | --: | --: | --: | --: | --: |");

  const empty = { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0 };
  for (const epic of EPICS) {
    const s = agg.byEpic[epic] || empty;
    if (s.total === 0) continue;
    const label = EPIC_DISPLAY[epic] || epic;
    lines.push(
      `| ${label} | ${s.total} | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} | ${passRatePercent(s)} |`,
    );
  }
  const other = agg.byEpic.other;
  if (other && other.total > 0) {
    lines.push(
      `| ${EPIC_DISPLAY.other} | ${other.total} | ${other.passed} | ${other.failed} | ${other.broken} | ${other.skipped} | ${passRatePercent(other)} |`,
    );
  }
  const t = agg.total;
  lines.push(
    `| **All layers** | **${t.total}** | **${t.passed}** | **${t.failed}** | **${t.broken}** | **${t.skipped}** | ${passRatePercent(t)} |`,
  );
  lines.push("");
  lines.push("</details>");
  lines.push("");
  if (pagesUrl && forkPr !== "true") {
    lines.push(`**[View full report on GitHub Pages](${pagesUrl})**`);
    if (sourceRunId) {
      lines.push("");
      lines.push(
        `_This link includes a cache-busting query (\`run=${sourceRunId}\`) so the browser loads the latest deploy for this PR Pipeline run._`,
      );
    }
  } else if (forkPr === "true") {
    lines.push(
      "_Preview on GitHub Pages is only published for PRs from the same repository. Download the `allure-report` artifact from this workflow run._",
    );
  } else {
    lines.push("_GitHub Pages URL not available for this run._");
  }
  lines.push("");
  lines.push(
    `_Generated by [quokkify/allure-report-action](${ACTION_REPOSITORY_URL}) \`${displayActionVersion(actionVersion)}\` · [Latest release](${ACTION_REPOSITORY_URL}/releases/latest)._`,
  );
  lines.push("");
  lines.push(commentMarker);

  fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
  process.stdout.write(`Wrote PR body to ${outputFile}\n`);
}

const emptyStats = () => ({
  passed: 0,
  failed: 0,
  broken: 0,
  skipped: 0,
  unknown: 0,
  total: 0,
});

/** @param {string[]} epics @param {Record<string, ReturnType<emptyStats>>} byEpic */
function sumEpicStats(epics, byEpic) {
  const s = emptyStats();
  for (const e of epics) {
    const p = byEpic[e] || emptyStats();
    s.passed += p.passed;
    s.failed += p.failed;
    s.broken += p.broken;
    s.skipped += p.skipped;
    s.unknown += p.unknown;
    s.total += p.total;
  }
  return s;
}

function pyramidAdvisoryNotes(unitShare, e2eShare, pyramidTotal) {
  if (pyramidTotal === 0) {
    return [
      "- No Allure results in this directory — pyramid share advisory skipped (run tests or point `--results` at merged CI output).",
    ];
  }
  const lines = [];
  if (unitShare < PYRAMID_ADVISORY.unitShareMin) {
    lines.push(
      `- **Unit share** ${(100 * unitShare).toFixed(1)}% is below the soft planning target (~${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}%+). Consider adding or restoring fast unit tests before expanding API/E2E.`,
    );
  }
  if (e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
    lines.push(
      `- **UI / E2E share** ${(100 * e2eShare).toFixed(1)}% exceeds the soft ceiling (~${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%). Check whether some cases can move down to API or unit layers.`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      "- Pyramid layer shares sit within the **soft** planning band documented in `docs/testing/test-pyramid.md` (not a merge gate).",
    );
  }
  return lines;
}

/** @param {string} s */
function githubWorkflowEscape(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

/** @param {string} title @param {string} message */
function emitGithubWarning(title, message) {
  process.stdout.write(
    `::warning title=${githubWorkflowEscape(title)}::${githubWorkflowEscape(message)}\n`,
  );
}

/** @param {string} md */
function appendJobSummaryIfPresent(md) {
  const p = process.env.GITHUB_STEP_SUMMARY;
  if (!p) return;
  fs.appendFileSync(p, md, "utf8");
}

/**
 * Shared metrics for pyramid export and pyramid-check.
 * @param {string} resultsDir
 */
function computePyramidMetrics(resultsDir) {
  const { byEpic, total } = aggregateResults(resultsDir);
  const other = byEpic.other || emptyStats();

  const layers = PYRAMID_LAYERS.map((def) => ({
    id: def.id,
    label: def.label,
    epics: def.epics,
    stats: sumEpicStats(def.epics, byEpic),
  }));

  const pyramidTotal = layers.reduce((a, L) => a + L.stats.total, 0);
  const unitStats = layers.find((L) => L.id === "unit").stats;
  const apiStats = layers.find((L) => L.id === "api").stats;
  const e2eLayer = layers.find((L) => L.id === "ui_e2e");
  const unitShare = pyramidTotal ? unitStats.total / pyramidTotal : 0;
  const apiShare = pyramidTotal ? apiStats.total / pyramidTotal : 0;
  const e2eShare = pyramidTotal ? e2eLayer.stats.total / pyramidTotal : 0;

  return {
    byEpic,
    total,
    other,
    layers,
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
  };
}

/**
 * Non-blocking quality gates: warnings only; `blockingFailures` reserved for future strict mode.
 * @param {ReturnType<typeof computePyramidMetrics>} m
 */
function evaluatePyramidQualityGates(m) {
  /** @type {{ id: string, message: string }[]} */
  const warnings = [];
  /** @type {{ id: string, message: string }[]} */
  const blockingFailures = [];

  if (m.pyramidTotal > 0) {
    if (m.unitShare < PYRAMID_ADVISORY.unitShareMin) {
      warnings.push({
        id: "PYRAMID_UNIT_SHARE_LOW",
        message: `Unit share ${(100 * m.unitShare).toFixed(1)}% is below soft target ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% (see docs/testing/test-pyramid.md).`,
      });
    }
    if (m.e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
      warnings.push({
        id: "PYRAMID_E2E_SHARE_HIGH",
        message: `UI/E2E share ${(100 * m.e2eShare).toFixed(1)}% exceeds soft ceiling ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%.`,
      });
    }
  }

  if (m.other.total > 0) {
    warnings.push({
      id: "PYRAMID_UNKNOWN_EPIC",
      message: `${m.other.total} test(s) lack a known Allure epic — assign epic in Vitest/pytest/Playwright so they count toward the pyramid.`,
    });
  }

  return {
    blockingFailures,
    warnings,
    advisoryOnly: true,
    thresholds: { ...PYRAMID_ADVISORY },
  };
}

/** @param {ReturnType<typeof evaluatePyramidQualityGates>} gates @param {ReturnType<typeof computePyramidMetrics>} m */
function formatQualityGatesMarkdownSection(gates, m) {
  const lines = [];
  lines.push("## Quality gates (non-blocking, advisory)");
  lines.push("");
  lines.push(
    "These checks **never fail the workflow**; they surface in GitHub **Annotations** (warnings) and in the **Job summary** when `pyramid-check` runs (Test Report workflow).",
  );
  lines.push("");
  if (m.pyramidTotal === 0) {
    lines.push("| Check | Status |");
    lines.push("| --- | --- |");
    lines.push("| Pyramid layer totals | ⚠️ skipped (no `unit`/`api`/`end-to-end`/`ui` cases in merged results) |");
    lines.push("");
    if (m.other.total > 0) {
      lines.push(
        `**Note:** ${m.other.total} test(s) use an unknown or unsupported \`epic\` — they do not count toward Σ pyramid layers until labels are fixed.`,
      );
      lines.push("");
    }
    return lines.join("\n");
  }
  lines.push("| Gate id | Status | Detail |");
  lines.push("| --- | --- | --- |");
  const warnIds = new Set(gates.warnings.map((w) => w.id));
  lines.push(
    `| PYRAMID_UNIT_SHARE_LOW | ${warnIds.has("PYRAMID_UNIT_SHARE_LOW") ? "⚠️ warning" : "✓ ok"} | unit ≥ ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% of Σ layers (actual ${(100 * m.unitShare).toFixed(1)}%) |`,
  );
  lines.push(
    `| PYRAMID_E2E_SHARE_HIGH | ${warnIds.has("PYRAMID_E2E_SHARE_HIGH") ? "⚠️ warning" : "✓ ok"} | UI/E2E ≤ ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}% of Σ layers (actual ${(100 * m.e2eShare).toFixed(1)}%) |`,
  );
  lines.push(
    `| PYRAMID_UNKNOWN_EPIC | ${warnIds.has("PYRAMID_UNKNOWN_EPIC") ? "⚠️ warning" : "✓ ok"} | no epic assigned: ${m.other.total} |`,
  );
  lines.push("");
  lines.push("_Blocking failures: none (reserved for a future strict mode)._");
  lines.push("");
  return lines.join("\n");
}

/**
 * @param {string} resultsDir
 * @param {string} outputJson optional path to write machine-readable gate result
 */
function cmdPyramidCheck(resultsDir, outputJson) {
  const m = computePyramidMetrics(resultsDir);
  const gates = evaluatePyramidQualityGates(m);
  const titleBase = "Test pyramid (advisory)";

  const outPayload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    advisoryOnly: true,
    exitCodePolicy: "always_zero",
    gates,
    metrics: {
      pyramidTotal: m.pyramidTotal,
      unitShare: m.unitShare,
      apiShare: m.apiShare,
      e2eShare: m.e2eShare,
      otherEpicTotal: m.other.total,
    },
  };

  if (outputJson) {
    fs.mkdirSync(path.dirname(outputJson), { recursive: true });
    fs.writeFileSync(outputJson, JSON.stringify(outPayload, null, 2), "utf8");
    process.stdout.write(`Wrote ${outputJson}\n`);
  }

  for (const w of gates.warnings) {
    emitGithubWarning(titleBase, `${w.id}: ${w.message}`);
  }

  const sum = [];
  sum.push("### Quality gates — test pyramid (advisory, non-blocking)\n\n");
  sum.push(formatQualityGatesMarkdownSection(gates, m));
  sum.push("\n");
  appendJobSummaryIfPresent(sum.join(""));

  process.stdout.write(
    `pyramid-check: ${gates.warnings.length} advisory warning(s), 0 blocking (exit 0).\n`,
  );
}

function formatCountScaledPyramidDiagram(layers) {
  const byId = Object.fromEntries(layers.map((L) => [L.id, L]));
  const rows = ["ui_e2e", "api", "unit"]
    .map((id) => byId[id])
    .filter(Boolean);
  const maxVisualWidth = 28;
  const maxTotal = Math.max(...rows.map((L) => L.stats.total), 1);
  const legendWidth = Math.max(...layers.map((L) => L.label.length));
  const countWidth = Math.max(5, ...layers.map((L) => String(L.stats.total).length));
  const diagramIndent = 6;

  const lines = [];
  for (const layer of rows) {
    const visualWidth = Math.max(1, Math.round((maxVisualWidth * layer.stats.total) / maxTotal));
    const leftPad = Math.floor((maxVisualWidth - visualWidth) / 2);
    const blocks = `${" ".repeat(leftPad)}${"█".repeat(visualWidth)}`;
    lines.push(
      `${layer.label.padEnd(legendWidth)} ${String(layer.stats.total).padStart(countWidth)}${" ".repeat(diagramIndent)}${blocks}`,
    );
  }
  return lines;
}

function replaceReadmePyramidTable(readmePath, tableMd) {
  const start = "<!-- CSP_PYRAMID_TABLE_START -->";
  const end = "<!-- CSP_PYRAMID_TABLE_END -->";
  const raw = fs.readFileSync(readmePath, "utf8");
  if (!raw.includes(start) || !raw.includes(end)) {
    console.error(`README markers missing: ${start} … ${end}`);
    process.exit(1);
  }
  const next = raw.replace(
    new RegExp(
      `${start}[\\s\\S]*?${end}`,
      "m",
    ),
    `${start}\n${tableMd}\n${end}`,
  );
  fs.writeFileSync(readmePath, next, "utf8");
  process.stdout.write(`Updated pyramid table in ${readmePath}\n`);
}

/**
 * @param {string} resultsDir
 * @param {string} outputMd
 * @param {string} outputJson
 * @param {string} readmePath optional
 * @param {string} policyPath optional caller-repository policy path
 */
function cmdPyramid(resultsDir, outputMd, outputJson, readmePath, policyPath) {
  const m = computePyramidMetrics(resultsDir);
  const { total, other, layers, pyramidTotal, unitShare, e2eShare } = m;
  const gates = evaluatePyramidQualityGates(m);

  const generatedAt = new Date().toISOString();
  const payload = {
    schemaVersion: 1,
    generatedAt,
    source: {
      workflowRunId: process.env.PYRAMID_SOURCE_RUN_ID || null,
      headSha: process.env.PYRAMID_HEAD_SHA || null,
    },
    pyramidLayerTotals: Object.fromEntries(
      layers.map((L) => [L.id, L.stats.total]),
    ),
    pyramidTotal,
    otherEpicTotal: other.total,
    allureGrandTotal: total.total,
    shares: pyramidTotal
      ? {
          unit: unitShare,
          api: m.apiShare,
          ui_e2e: e2eShare,
        }
      : { unit: 0, api: 0, ui_e2e: 0 },
    advisory: {
      unitShareMin: PYRAMID_ADVISORY.unitShareMin,
      e2eShareMax: PYRAMID_ADVISORY.e2eShareMax,
    },
    qualityGates: {
      advisoryOnly: gates.advisoryOnly,
      warnings: gates.warnings,
      blockingFailures: gates.blockingFailures,
    },
  };

  if (outputJson) {
    fs.mkdirSync(path.dirname(outputJson), { recursive: true });
    fs.writeFileSync(outputJson, JSON.stringify(payload, null, 2), "utf8");
    process.stdout.write(`Wrote ${outputJson}\n`);
  }

  const md = [];
  md.push("# Test pyramid snapshot");
  md.push("");
  md.push(`_Generated: \`${generatedAt}\`_`);
  if (payload.source.workflowRunId) {
    md.push(`_Source workflow run id: \`${payload.source.workflowRunId}\`_`);
  }
  if (payload.source.headSha) {
    md.push(`_Head SHA: \`${payload.source.headSha.slice(0, 7)}\`_`);
  }
  md.push("");
  md.push("## Counts by layer (`epic` / Allure `layer`)");
  md.push("");
  md.push("| Layer | `epic` / `layer` | Cases | Passed | Failed | Broken | Skipped |");
  md.push("| --- | --- | --: | --: | --: | --: | --: |");
  for (const L of layers) {
    const s = L.stats;
    const epicCol = pyramidMarkdownEpicColumn(L);
    md.push(
      `| ${L.label} | ${epicCol} | **${s.total}** | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} |`,
    );
  }
  md.push(`| **Σ pyramid layers** | | **${pyramidTotal}** | | | | |`);
  md.push("");
  if (other.total > 0) {
    md.push(
      `> **No epic assigned:** ${other.total} case(s) — assign \`epic\` in Vitest/pytest/Playwright setup so they roll into the pyramid.`,
    );
    md.push("");
  }
  md.push("## Shares (pyramid layers only)");
  md.push("");
  if (pyramidTotal === 0) {
    md.push("_No results in the given directory — nothing to chart._");
  } else {
    md.push(
      `| Layer | Share of Σ layers |`,
    );
    md.push(`| --- | ---: |`);
    for (const L of layers) {
      const pct = (100 * L.stats.total) / pyramidTotal;
      md.push(`| ${L.label} | ${pct.toFixed(1)}% |`);
    }
    md.push("");
    md.push("```text");
    md.push(...formatCountScaledPyramidDiagram(layers));
    md.push("```");
  }
  md.push("");
  md.push("## Advisory (planning only)");
  md.push("");
  md.push(...pyramidAdvisoryNotes(unitShare, e2eShare, pyramidTotal));
  md.push("");
  md.push(formatQualityGatesMarkdownSection(gates, m));
  if (policyPath) {
    const policyHref = path
      .relative(path.resolve(path.dirname(outputMd)), path.resolve(policyPath))
      .split(path.sep)
      .join("/");
    md.push(`Canonical policy: [\`${policyPath}\`](${policyHref}).`);
  }

  fs.mkdirSync(path.dirname(outputMd), { recursive: true });
  fs.writeFileSync(outputMd, md.join("\n"), "utf8");
  process.stdout.write(`Wrote ${outputMd}\n`);

  if (readmePath) {
    const tbl = [];
    tbl.push("| Layer | `epic` / `layer` | Cases |");
    tbl.push("| :--- | :--- | ---: |");
    for (const L of layers) {
      const epicCol = pyramidMarkdownEpicColumn(L);
      tbl.push(`| ${L.label} | ${epicCol} | **${L.stats.total}** |`);
    }
    tbl.push(`| **Σ pyramid layers** | | **${pyramidTotal}** |`);
    if (other.total > 0) {
      tbl.push(`| No epic assigned | — | **${other.total}** |`);
    }
    replaceReadmePyramidTable(readmePath, tbl.join("\n"));
  }
}

function parseArgs(argv) {
  const cmd = argv[2];
  const args = argv.slice(3);
  const get = (name) => {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : null;
  };
  return {
    cmd,
    results: get("--results") || "./allure-results",
    report: get("--report") || "./allure-report",
    config: get("--config") || "./allurerc.mjs",
    out: get("--out") || get("--report") || "./allure-report",
    output:
      get("--output") ||
      (cmd === "pyramid" ? "docs/testing/pyramid-snapshot.md" : "allure-pr-comment.md"),
    pagesUrl: get("--pages-url") || "",
    forkPr: get("--fork-pr") || "false",
    sourceRunId: get("--source-run-id") || "",
    actionVersion: get("--action-version") || bundledActionVersion(),
    moduleLabel: get("--module-label") || "module",
    sourceRoot: get("--source-root") || path.dirname(get("--results") || "./allure-results"),
    commentMarker: get("--comment-marker") || "<!-- project-toolkit-allure-ci -->",
    json: get("--json") || "",
    readme: get("--readme") || "",
    policyPath: get("--policy-path") || "",
  };
}

const {
  cmd,
  results,
  report,
  config,
  out,
  output,
  pagesUrl,
  forkPr,
  sourceRunId,
  actionVersion,
  moduleLabel,
  sourceRoot,
  commentMarker,
  json,
  readme,
  policyPath,
} = parseArgs(process.argv);

if (cmd === "module-config") {
  await cmdModuleConfig(results, sourceRoot, config, output, moduleLabel);
} else if (cmd === "badges") {
  cmdBadges(results, out);
} else if (cmd === "pr-body") {
  cmdPrBody(
    results,
    report,
    output,
    pagesUrl,
    forkPr,
    sourceRunId,
    commentMarker,
    actionVersion,
  );
} else if (cmd === "pyramid") {
  cmdPyramid(results, output, json, readme, policyPath);
} else if (cmd === "pyramid-check") {
  const gateJson = json || "docs/testing/pyramid-quality-gates.json";
  cmdPyramidCheck(results, gateJson);
} else {
  console.error(
    "Usage: node allure-ci.mjs badges --results <dir> --out <reportDir>\n" +
      "       node allure-ci.mjs module-config --results <dir> [--source-root <dir>] --config <allurerc.mjs> --output <effective.mjs> [--module-label module]\n" +
      "       node allure-ci.mjs pr-body --results <dir> --report <reportDir> --output <file> [--pages-url <url>] [--fork-pr true|false] [--source-run-id <id>] [--action-version <version>]\n" +
      "       node allure-ci.mjs pyramid --results <dir> --output <file.md> [--json <file.json>] [--readme README.md] [--policy-path <file.md>]\n" +
      "       node allure-ci.mjs pyramid-check --results <dir> [--json <quality-gates.json>]",
  );
  process.exit(1);
}
