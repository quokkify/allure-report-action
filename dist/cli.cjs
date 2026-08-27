#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// dist/allure/prepare-results.js
var import_node_crypto = require("node:crypto");
var fs = __toESM(require("node:fs"), 1);
var path = __toESM(require("node:path"), 1);
var SOURCE_SCAN_SKIP_DIRECTORIES = /* @__PURE__ */ new Set([
  ".git",
  ".gradle",
  ".idea",
  ".venv",
  "allure-report",
  "dist",
  "node_modules",
  "venv"
]);
var MAX_SOURCE_FILES = 1e5;
var MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
var MAX_SOURCE_FILE_BYTES = 256 * 1024 * 1024;
var MAX_FRAGMENT_BYTES = 1024 * 1024;
var MAX_FRAGMENT_VARIABLES = 1e4;
var MAX_FRAGMENT_VARIABLE_BYTES = 4 * 1024 * 1024;
var MAX_PRESERVED_METADATA_BYTES = 16 * 1024 * 1024;
var PRESERVED_DESTINATION_METADATA = ["environment.properties", "executor.json"];
var MODULE_VARIABLES_METADATA = ".allure-module-variables.json";
var MAX_SANITIZED_FILES = 1e5;
var MAX_SANITIZED_BYTES = 2 * 1024 * 1024 * 1024;
var ACTIVE_ATTACHMENT_EXTENSIONS = /* @__PURE__ */ new Set([
  ".cjs",
  ".htm",
  ".html",
  ".js",
  ".mjs",
  ".svg",
  ".xhtml"
]);
function parseModuleFragment(fragmentPath) {
  const stat = fs.lstatSync(fragmentPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Module provenance must be a regular file: ${fragmentPath}`);
  }
  if (stat.size > MAX_FRAGMENT_BYTES) {
    throw new Error(`Module provenance exceeds ${MAX_FRAGMENT_BYTES} bytes: ${fragmentPath}`);
  }
  const modules = /* @__PURE__ */ new Set();
  const variables = /* @__PURE__ */ new Map();
  for (const rawLine of fs.readFileSync(fragmentPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("="))
      continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (!key || key === "__proto__" || key.length > 512 || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(key) || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(`Invalid environment variable in ${fragmentPath}`);
    }
    const previous = variables.get(key);
    if (previous !== void 0 && previous !== value) {
      throw new Error(`Conflicting environment variable ${key} in ${fragmentPath}`);
    }
    variables.set(key, value);
    if ((key === "Module" || key.endsWith(".Module")) && value)
      modules.add(value);
  }
  if (modules.size !== 1) {
    const detail = modules.size === 0 ? "none" : [...modules].sort().join(", ");
    throw new Error(`Expected exactly one module value in ${fragmentPath}; found ${detail}`);
  }
  const moduleArray = [...modules];
  return { moduleName: moduleArray[0], variables };
}
function findSourceResultDirectories(sourceRoot, resultsDir) {
  const root = path.resolve(sourceRoot);
  const destination = path.resolve(resultsDir);
  if (!fs.existsSync(root))
    throw new Error(`Source artifacts directory not found: ${sourceRoot}`);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Source artifacts path must be a regular directory: ${sourceRoot}`);
  }
  const sources = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === destination)
      continue;
    if (path.basename(directory) === "allure-results") {
      sources.push(directory);
      continue;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`Symbolic links are not allowed: ${child}`);
      if (!entry.isDirectory())
        continue;
      if (SOURCE_SCAN_SKIP_DIRECTORIES.has(entry.name))
        continue;
      stack.push(child);
    }
  }
  return sources.sort();
}
function sha256(buffer) {
  return (0, import_node_crypto.createHash)("sha256").update(buffer).digest("hex");
}
function attributedResultBuffer(file, moduleName, moduleLabel) {
  let document;
  try {
    document = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`Malformed Allure result JSON ${file}: ${error.message}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Allure result must be a JSON object: ${file}`);
  }
  if (document.labels !== void 0 && !Array.isArray(document.labels)) {
    throw new Error(`Allure result labels must be an array: ${file}`);
  }
  const labels = (document.labels || []).filter((label) => !label || label.name !== moduleLabel);
  labels.push({ name: moduleLabel, value: moduleName });
  document.labels = labels;
  return Buffer.from(`${JSON.stringify(document)}
`, "utf8");
}
function safeResultName(name) {
  return name === path.basename(name) && !name.includes("\\") && !name.includes("\0");
}
function rejectActiveAttachment(name, data) {
  if (ACTIVE_ATTACHMENT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
    throw new Error(`Active Allure attachment is not allowed: ${name}`);
  }
  const text = data.toString("utf8", 0, Math.min(data.length, 64 * 1024)).toLowerCase();
  if (/<\s*script\b|<\s*(iframe|object|embed|svg)\b|javascript\s*:/.test(text)) {
    throw new Error(`Active content in Allure attachment is not allowed: ${name}`);
  }
}
function sanitizeResults(options) {
  const input = path.resolve(options.inputDir);
  const output = path.resolve(options.outputDir);
  const inputStat = fs.lstatSync(input);
  if (!inputStat.isDirectory() || inputStat.isSymbolicLink()) {
    throw new Error(`Allure results input must be a regular directory: ${options.inputDir}`);
  }
  if (input === output || output.startsWith(`${input}${path.sep}`)) {
    throw new Error("Sanitized Allure results directory must be outside the input directory");
  }
  const regular = /* @__PURE__ */ new Map();
  const referenced = /* @__PURE__ */ new Set();
  let totalBytes = 0;
  for (const entry of fs.readdirSync(input, { withFileTypes: true })) {
    const file = path.join(input, entry.name);
    if (!safeResultName(entry.name))
      throw new Error(`Unsafe Allure result filename: ${entry.name}`);
    if (entry.isSymbolicLink() || !entry.isFile()) {
      throw new Error(`Only regular Allure result files are allowed: ${entry.name}`);
    }
    const stat = fs.lstatSync(file);
    if (stat.nlink > 1)
      throw new Error(`Hard-linked Allure result files are not allowed: ${entry.name}`);
    if (stat.size > MAX_SOURCE_FILE_BYTES)
      throw new Error(`Allure result file exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${entry.name}`);
    totalBytes += stat.size;
    if (regular.size >= MAX_SANITIZED_FILES || totalBytes > MAX_SANITIZED_BYTES) {
      throw new Error("Allure result inputs exceed count or byte limits");
    }
    const data = fs.readFileSync(file);
    if (entry.name.endsWith("-result.json") || entry.name.endsWith("-container.json")) {
      let document;
      try {
        document = JSON.parse(data.toString("utf8"));
      } catch (error) {
        throw new Error(`Malformed Allure input JSON ${entry.name}: ${error.message}`);
      }
      if (!document || typeof document !== "object" || Array.isArray(document)) {
        throw new Error(`Allure input must be a JSON object: ${entry.name}`);
      }
      if (entry.name.endsWith("-result.json")) {
        const attachments = document.attachments;
        if (attachments !== void 0 && !Array.isArray(attachments))
          throw new Error(`Malformed attachment references: ${entry.name}`);
        for (const attachment of attachments ?? []) {
          if (!attachment || typeof attachment.source !== "string" || !safeResultName(attachment.source)) {
            throw new Error(`Malformed attachment reference in ${entry.name}`);
          }
          referenced.add(attachment.source);
        }
      }
    }
    regular.set(entry.name, data);
  }
  if (![...regular.keys()].some((name) => name.endsWith("-result.json"))) {
    throw new Error("No Allure result JSON files found in downloaded artifact");
  }
  for (const reference of referenced) {
    if (!regular.has(reference))
      throw new Error(`Missing Allure attachment referenced by result: ${reference}`);
  }
  for (const [name, data] of regular) {
    if (referenced.has(name))
      rejectActiveAttachment(name, data);
    if (!name.endsWith("-result.json") && !name.endsWith("-container.json") && !name.endsWith(".json") && !name.endsWith(".properties")) {
      if (!referenced.has(name))
        throw new Error(`Unreferenced Allure attachment is not allowed: ${name}`);
    }
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = fs.mkdtempSync(path.join(path.dirname(output), `.${path.basename(output)}-sanitize-`));
  try {
    for (const [name, data] of regular)
      fs.writeFileSync(path.join(temporary, name), data, { flag: "wx", mode: 384 });
    fs.rmSync(output, { recursive: true, force: true });
    fs.renameSync(temporary, output);
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}
function prepareAttributedResults(options) {
  const { sourceRoot, resultsDir, moduleLabel, autoMode } = options;
  if (!sourceRoot.trim())
    throw new Error("--source-root must not be empty");
  if (!moduleLabel.trim())
    throw new Error("--module-label must not be empty in attributed mode");
  const destination = path.resolve(resultsDir);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, `.${path.basename(destination)}-prepare-`));
  const backup = path.join(parent, `.${path.basename(destination)}-backup-${process.pid}-${Date.now()}`);
  let destinationMoved = false;
  let sourceDirectories = 0;
  let sourceFiles = 0;
  let sourceBytes = 0;
  let attributedResults = 0;
  let fragmentVariableBytes = 0;
  const staged = /* @__PURE__ */ new Map();
  const fragmentVariables = /* @__PURE__ */ new Map();
  const stage = (name, data, mode, source) => {
    const digest = sha256(data);
    const previous = staged.get(name);
    if (previous) {
      if (previous.digest === digest)
        return;
      throw new Error(`Conflicting source files named ${name}: ${previous.source} and ${source}`);
    }
    fs.writeFileSync(path.join(temporary, name), data, { flag: "wx", mode });
    staged.set(name, { digest, source });
  };
  try {
    const sourceDirectoriesFound = findSourceResultDirectories(sourceRoot, resultsDir);
    const withProvenance = sourceDirectoriesFound.filter((directory) => fs.existsSync(path.join(directory, "ci-env-fragment.properties")));
    if (autoMode && withProvenance.length === 0) {
      fs.rmSync(temporary, { recursive: true, force: true });
      console.log("No attributed source results detected; preserved legacy merged results");
      return;
    }
    if (sourceDirectoriesFound.length === 0) {
      throw new Error(`No source allure-results directories found under ${sourceRoot}`);
    }
    if (withProvenance.length !== sourceDirectoriesFound.length) {
      throw new Error(`Partial module provenance: ${withProvenance.length} of ${sourceDirectoriesFound.length} source directories contain ci-env-fragment.properties`);
    }
    if (fs.existsSync(destination)) {
      const destinationStat = fs.lstatSync(destination);
      if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
        throw new Error(`Results destination must be a regular directory: ${resultsDir}`);
      }
      for (const name of PRESERVED_DESTINATION_METADATA) {
        const file = path.join(destination, name);
        if (!fs.existsSync(file))
          continue;
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error(`Preserved metadata must be a regular file: ${file}`);
        }
        if (stat.size > MAX_PRESERVED_METADATA_BYTES) {
          throw new Error(`Preserved metadata exceeds ${MAX_PRESERVED_METADATA_BYTES} bytes: ${file}`);
        }
        stage(name, fs.readFileSync(file), stat.mode & 511, file);
      }
    }
    for (const directory of sourceDirectoriesFound) {
      sourceDirectories += 1;
      const fragment = path.join(directory, "ci-env-fragment.properties");
      if (!fs.existsSync(fragment)) {
        throw new Error(`Missing module provenance: ${fragment}`);
      }
      const { moduleName, variables } = parseModuleFragment(fragment);
      for (const [key, value] of variables) {
        const previous = fragmentVariables.get(key);
        if (previous !== void 0 && previous !== value) {
          throw new Error(`Conflicting environment variable ${key} across source fragments`);
        }
        if (previous === void 0) {
          fragmentVariableBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
          if (fragmentVariables.size >= MAX_FRAGMENT_VARIABLES || fragmentVariableBytes > MAX_FRAGMENT_VARIABLE_BYTES) {
            throw new Error("Module environment variables exceed count or byte limits");
          }
          fragmentVariables.set(key, value);
        }
      }
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink() || !entry.isFile()) {
          throw new Error(`Only regular files are allowed in source results: ${file}`);
        }
        if (entry.name === "ci-env-fragment.properties")
          continue;
        if (entry.name === MODULE_VARIABLES_METADATA) {
          throw new Error(`Reserved source result filename is not allowed: ${file}`);
        }
        const stat = fs.lstatSync(file);
        if (stat.size > MAX_SOURCE_FILE_BYTES) {
          throw new Error(`Source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${file}`);
        }
        sourceFiles += 1;
        sourceBytes += stat.size;
        if (sourceFiles > MAX_SOURCE_FILES || sourceBytes > MAX_SOURCE_BYTES) {
          throw new Error(`Source results exceed limits (${MAX_SOURCE_FILES} files / ${MAX_SOURCE_BYTES} bytes)`);
        }
        const data = entry.name.endsWith("-result.json") ? attributedResultBuffer(file, moduleName, moduleLabel) : fs.readFileSync(file);
        if (entry.name.endsWith("-result.json"))
          attributedResults += 1;
        stage(entry.name, data, stat.mode & 511, file);
      }
    }
    if (attributedResults === 0)
      throw new Error("No Allure result JSON files found in source artifacts");
    const environmentMetadata = Buffer.from(JSON.stringify(Object.fromEntries([...fragmentVariables].sort(([left], [right]) => left.localeCompare(right)))), "utf8");
    if (environmentMetadata.length > MAX_FRAGMENT_VARIABLE_BYTES) {
      throw new Error("Module environment metadata exceeds byte limit");
    }
    stage(MODULE_VARIABLES_METADATA, environmentMetadata, 384, "source fragments");
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      destinationMoved = true;
    }
    fs.renameSync(temporary, destination);
    if (destinationMoved)
      fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (destinationMoved && !fs.existsSync(destination) && fs.existsSync(backup)) {
      fs.renameSync(backup, destination);
    }
    throw error;
  }
  console.log(`Prepared ${attributedResults} attributed result(s) from ${sourceDirectories} source directories (${sourceFiles} files)`);
}

// dist/allure/badges.js
var fs2 = __toESM(require("node:fs"), 1);
var path2 = __toESM(require("node:path"), 1);
function getColorForStats(stats) {
  if (stats.failed > 0 || stats.broken > 0)
    return "red";
  if (stats.skipped > 0 && stats.passed + stats.failed + stats.broken === 0)
    return "yellow";
  if (stats.passed > 0)
    return "brightgreen";
  return "lightgrey";
}
function getMessageForStats(stats) {
  if (stats.total === 0)
    return "no tests";
  const parts = [];
  if (stats.passed)
    parts.push(`${stats.passed} passed`);
  if (stats.failed)
    parts.push(`${stats.failed} failed`);
  if (stats.broken)
    parts.push(`${stats.broken} broken`);
  if (stats.skipped)
    parts.push(`${stats.skipped} skipped`);
  if (stats.unknown)
    parts.push(`${stats.unknown} other`);
  return parts.join(", ") || `${stats.total} total`;
}
function createShieldJson(label, stats) {
  return {
    schemaVersion: 1,
    label,
    message: getMessageForStats(stats),
    color: getColorForStats(stats)
  };
}
function generateBadges(results, reportDir) {
  const badgeDir = path2.join(reportDir, "badges");
  fs2.mkdirSync(badgeDir, { recursive: true });
  const totalBadge = createShieldJson("all tests", results.total);
  fs2.writeFileSync(path2.join(badgeDir, "total.json"), JSON.stringify(totalBadge, null, 0));
  const epics = ["unit", "api", "ui", "end-to-end", "other"];
  for (const epic of epics) {
    const stats = results.byEpic[epic] || {
      total: 0,
      passed: 0,
      failed: 0,
      broken: 0,
      skipped: 0,
      unknown: 0
    };
    const badge = createShieldJson(`${epic} tests`, stats);
    fs2.writeFileSync(path2.join(badgeDir, `${epic}.json`), JSON.stringify(badge, null, 0));
  }
}

// dist/report/model.js
var EPIC_DISPLAY = {
  unit: "Unit",
  api: "Integration",
  ui: "UI",
  "end-to-end": "E2E",
  other: "No epic assigned"
};
var PYRAMID_LAYERS = [
  { id: "unit", epics: ["unit"], label: "Unit (base)", epicNote: "`unit`" },
  {
    id: "api",
    epics: ["api"],
    label: "Integration (middle)",
    epicNote: "`epic: api`, Allure `layer: integration`"
  },
  {
    id: "ui_e2e",
    epics: ["end-to-end", "ui"],
    label: "UI / E2E (top)",
    epicNote: "`end-to-end` (+ `ui` if used)"
  }
];
var PYRAMID_ADVISORY = {
  unitShareMin: 0.45,
  e2eShareMax: 0.28
};
var ACTION_REPOSITORY_URL = "https://github.com/quokkify/allure-report-action";

// dist/report/summary.js
async function readWidgetSummary(reportDir) {
  try {
    const fs8 = await import("node:fs");
    const path7 = await import("node:path");
    return JSON.parse(fs8.readFileSync(path7.join(reportDir, "widgets", "summary.json"), "utf8"));
  } catch {
    return null;
  }
}
function mergeSummary(widget, aggregated) {
  if (!widget?.statistic)
    return aggregated.total;
  const stat = widget.statistic;
  return {
    total: stat.total ?? aggregated.total.total,
    passed: stat.passed ?? 0,
    failed: stat.failed ?? 0,
    broken: stat.broken ?? 0,
    skipped: stat.skipped ?? 0,
    unknown: Math.max(stat.unknown ?? 0, aggregated.total.unknown)
  };
}

// dist/report/aggregation.js
function emptyStats() {
  return { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
}
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
function aggregateResults(files, readJsonFile, getEpicForResult2) {
  const byEpic = {
    unit: emptyStats(),
    api: emptyStats(),
    ui: emptyStats(),
    "end-to-end": emptyStats(),
    other: emptyStats()
  };
  const total = emptyStats();
  let resultCount = 0;
  for (const file of files) {
    const result = readJsonFile(file);
    if (!result || typeof result.status !== "string")
      continue;
    const status = result.status.toLowerCase();
    const epic = getEpicForResult2(result);
    const bucket = byEpic[epic];
    bucket.total++;
    total.total++;
    switch (status) {
      case "passed":
        bucket.passed++;
        total.passed++;
        break;
      case "failed":
        bucket.failed++;
        total.failed++;
        break;
      case "broken":
        bucket.broken++;
        total.broken++;
        break;
      case "skipped":
        bucket.skipped++;
        total.skipped++;
        break;
      default:
        bucket.unknown++;
        total.unknown++;
    }
    resultCount++;
  }
  const layers = PYRAMID_LAYERS.map((layerDef) => ({
    id: layerDef.id,
    label: layerDef.label,
    epics: [...layerDef.epics],
    stats: sumEpicStats([...layerDef.epics], byEpic)
  }));
  const pyramidTotal = layers.reduce((sum, layer) => sum + layer.stats.total, 0);
  const unitStats = layers.find((l) => l.id === "unit")?.stats ?? emptyStats();
  const apiStats = layers.find((l) => l.id === "api")?.stats ?? emptyStats();
  const e2eLayer = layers.find((l) => l.id === "ui_e2e");
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
    e2eShare: pyramidTotal ? e2eStats.total / pyramidTotal : 0
  };
}

// dist/report/quality-gates.js
var fs3 = __toESM(require("node:fs"), 1);
var path3 = __toESM(require("node:path"), 1);
function evaluatePyramidQualityGates(metrics) {
  const warnings = [];
  const blockingFailures = [];
  if (metrics.pyramidTotal > 0) {
    if (metrics.unitShare < PYRAMID_ADVISORY.unitShareMin) {
      warnings.push({
        id: "PYRAMID_UNIT_SHARE_LOW",
        message: `Unit share ${(100 * metrics.unitShare).toFixed(1)}% is below soft target ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% (see docs/testing/test-pyramid.md).`
      });
    }
    if (metrics.e2eShare > PYRAMID_ADVISORY.e2eShareMax) {
      warnings.push({
        id: "PYRAMID_E2E_SHARE_HIGH",
        message: `UI/E2E share ${(100 * metrics.e2eShare).toFixed(1)}% exceeds soft ceiling ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}%.`
      });
    }
  }
  if (metrics.otherEpicTotal > 0) {
    warnings.push({
      id: "PYRAMID_UNKNOWN_EPIC",
      message: `${metrics.otherEpicTotal} test(s) lack a known Allure epic \u2014 assign epic in Vitest/pytest/Playwright so they count toward the pyramid.`
    });
  }
  return {
    blockingFailures,
    warnings,
    advisoryOnly: true,
    thresholds: { ...PYRAMID_ADVISORY }
  };
}
function formatQualityGatesMarkdownSection(gates, metrics) {
  const lines = [];
  lines.push("## Quality gates (non-blocking, advisory)");
  lines.push("");
  lines.push("These checks **never fail the workflow**; they surface in GitHub **Annotations** (warnings) and in the **Job summary** when `pyramid-check` runs (Test Report workflow).");
  lines.push("");
  if (metrics.pyramidTotal === 0) {
    lines.push("| Check | Status |");
    lines.push("| --- | --- |");
    lines.push("| Pyramid layer totals | \u26A0\uFE0F skipped (no `unit`/`api`/`end-to-end`/`ui` cases in merged results) |");
    lines.push("");
    if (metrics.otherEpicTotal > 0) {
      lines.push(`**Note:** ${metrics.otherEpicTotal} test(s) use an unknown or unsupported \`epic\` \u2014 they do not count toward \u03A3 pyramid layers until labels are fixed.`);
      lines.push("");
    }
    return lines.join("\n");
  }
  lines.push("| Gate id | Status | Detail |");
  lines.push("| --- | --- | --- |");
  const warnIds = new Set(gates.warnings.map((w) => w.id));
  lines.push(`| PYRAMID_UNIT_SHARE_LOW | ${warnIds.has("PYRAMID_UNIT_SHARE_LOW") ? "\u26A0\uFE0F warning" : "\u2713 ok"} | unit \u2265 ${(100 * PYRAMID_ADVISORY.unitShareMin).toFixed(0)}% of \u03A3 layers (actual ${(100 * metrics.unitShare).toFixed(1)}%) |`);
  lines.push(`| PYRAMID_E2E_SHARE_HIGH | ${warnIds.has("PYRAMID_E2E_SHARE_HIGH") ? "\u26A0\uFE0F warning" : "\u2713 ok"} | UI/E2E \u2264 ${(100 * PYRAMID_ADVISORY.e2eShareMax).toFixed(0)}% of \u03A3 layers (actual ${(100 * metrics.e2eShare).toFixed(1)}%) |`);
  lines.push(`| PYRAMID_UNKNOWN_EPIC | ${warnIds.has("PYRAMID_UNKNOWN_EPIC") ? "\u26A0\uFE0F warning" : "\u2713 ok"} | no epic assigned: ${metrics.otherEpicTotal} |`);
  lines.push("");
  lines.push("_Blocking failures: none (reserved for a future strict mode)._");
  lines.push("");
  return lines.join("\n");
}
function formatCountScaledPyramidDiagram(layers) {
  const byId = Object.fromEntries(layers.map((L) => [L.id, L]));
  const rows = ["ui_e2e", "api", "unit"].map((id) => byId[id]).filter((layer) => layer !== void 0);
  const maxVisualWidth = 28;
  const maxTotal = Math.max(...rows.map((L) => L.stats.total), 1);
  const legendWidth = Math.max(...layers.map((L) => L.label.length));
  const countWidth = Math.max(5, ...layers.map((L) => String(L.stats.total).length));
  const diagramIndent = 6;
  const lines = [];
  for (const layer of rows) {
    const visualWidth = Math.max(1, Math.round(maxVisualWidth * layer.stats.total / maxTotal));
    const leftPad = Math.floor((maxVisualWidth - visualWidth) / 2);
    const blocks = `${" ".repeat(leftPad)}${"\u2588".repeat(visualWidth)}`;
    lines.push(`${layer.label.padEnd(legendWidth)} ${String(layer.stats.total).padStart(countWidth)}${" ".repeat(diagramIndent)}${blocks}`);
  }
  return lines;
}
function writeQualityGatesJson(gates, metrics, outputPath) {
  const payload = {
    schemaVersion: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    advisoryOnly: true,
    exitCodePolicy: "always_zero",
    gates,
    metrics: {
      pyramidTotal: metrics.pyramidTotal,
      unitShare: metrics.unitShare,
      apiShare: metrics.apiShare,
      e2eShare: metrics.e2eShare,
      otherEpicTotal: metrics.otherEpicTotal
    }
  };
  fs3.mkdirSync(path3.dirname(outputPath), { recursive: true });
  fs3.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
  console.log(`Wrote ${outputPath}`);
}
function githubWorkflowEscape(s) {
  return String(s).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function emitGithubWarning(title, message) {
  console.log(`::warning title=${githubWorkflowEscape(title)}::${githubWorkflowEscape(message)}`);
}
function appendJobSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath)
    return;
  fs3.appendFileSync(summaryPath, markdown, "utf8");
}

// dist/allure/parser.js
var fs4 = __toESM(require("node:fs"), 1);
var path4 = __toESM(require("node:path"), 1);
function listResultFiles(resultsDir) {
  if (!fs4.existsSync(resultsDir))
    return [];
  return fs4.readdirSync(resultsDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith("-result.json")).map((entry) => path4.join(resultsDir, entry.name));
}
function readJsonSafe(file) {
  try {
    return JSON.parse(fs4.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
function getLabelValue(labels, name) {
  if (!Array.isArray(labels))
    return "";
  const label = labels.find((item) => item && item.name === name && item.value);
  return label ? String(label.value).trim() : "";
}
function getEpicForResult(result) {
  const rawEpic = getLabelValue(result.labels, "epic");
  if (rawEpic && ["unit", "api", "ui", "end-to-end"].includes(rawEpic)) {
    return rawEpic;
  }
  if (!Array.isArray(result.labels))
    return "other";
  const framework = result.labels?.find((l) => l && l.name === "framework");
  if (framework && String(framework.value).toLowerCase() === "playwright") {
    return "end-to-end";
  }
  return "other";
}
function calculatePassRate(passed, total) {
  if (!total)
    return "\u2014";
  const pct = 100 * passed / total;
  const rounded = Math.round(pct * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded}%`;
}

// dist/commands/badges.js
function runBadges(options) {
  const { resultsDir, reportDir } = options;
  const results = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), getEpicForResult);
  generateBadges(results, reportDir);
}

// dist/allure/config-generator.js
var fs5 = __toESM(require("node:fs"), 1);
var path5 = __toESM(require("node:path"), 1);
var import_node_url = require("node:url");
var MODULE_VARIABLES_METADATA2 = ".allure-module-variables.json";
var MAX_FRAGMENT_VARIABLES2 = 1e4;
var MAX_FRAGMENT_VARIABLE_BYTES2 = 4 * 1024 * 1024;
function normalizeModuleTokens(value) {
  return String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").split(/[^a-z0-9]+/).filter((token) => token && token !== "utils");
}
function parseVariableParts(key) {
  const index = key.lastIndexOf(".");
  if (index <= 0 || index === key.length - 1)
    return null;
  const prefix = key.slice(0, index).trim();
  if (!prefix)
    return null;
  return {
    prefix,
    moduleTokens: normalizeModuleTokens(prefix),
    name: key.slice(index + 1).trim()
  };
}
function tokensEqual(left, right) {
  return left.length === right.length && left.every((token, index) => token === right[index]);
}
function tokensEndWith(longer, shorter) {
  if (shorter.length === 0 || longer.length < shorter.length)
    return false;
  const offset = longer.length - shorter.length;
  return shorter.every((token, index) => longer[offset + index] === token);
}
function generateEnvironmentId(value, used) {
  const base = String(value || "").normalize("NFKD").toLowerCase().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 52) || "module";
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 52 - String(suffix).length - 1)}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}
function readModuleVariables(resultsDir) {
  const metadata = path5.join(resultsDir, MODULE_VARIABLES_METADATA2);
  if (!fs5.existsSync(metadata))
    return {};
  const stat = fs5.lstatSync(metadata);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FRAGMENT_VARIABLE_BYTES2) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  let document;
  try {
    document = JSON.parse(fs5.readFileSync(metadata, "utf8"));
  } catch {
    throw new Error(`Malformed module environment metadata: ${metadata}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  const entries = Object.entries(document);
  if (entries.length > MAX_FRAGMENT_VARIABLES2 || entries.some(([key, value]) => !key || key === "__proto__" || key.length > 512 || typeof value !== "string" || value.length > 8192 || /[\u0000-\u001f\u007f]/.test(key) || /[\u0000-\u001f\u007f]/.test(value))) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  return document;
}
async function generateModuleConfig(options) {
  const { resultsDir, configFile, outputFile, moduleLabel } = options;
  if (!moduleLabel.trim()) {
    throw new Error("--module-label must not be empty");
  }
  const configPath = path5.resolve(configFile);
  if (!fs5.existsSync(configPath)) {
    throw new Error(`Allure config not found: ${configFile}`);
  }
  const moduleNames = /* @__PURE__ */ new Set();
  let unmatchedResults = 0;
  for (const file of listResultFiles(resultsDir)) {
    const doc = readJsonSafe(file);
    const moduleName = getLabelValue(doc?.labels, moduleLabel);
    if (moduleName)
      moduleNames.add(moduleName);
    else
      unmatchedResults += 1;
  }
  const configUrl = (0, import_node_url.pathToFileURL)(configPath).href;
  const baseConfigModule = await import(configUrl);
  const baseConfig = baseConfigModule.default || {};
  const allVariables = { ...baseConfig.variables || {} };
  const environments = baseConfig.environments || {};
  for (const descriptor of Object.values(environments)) {
    Object.assign(allVariables, descriptor?.variables || {});
  }
  Object.assign(allVariables, readModuleVariables(resultsDir));
  if (moduleNames.size > 0) {
    for (const [key, value] of Object.entries(allVariables)) {
      if (key.toLowerCase().endsWith(".module") && String(value || "").trim()) {
        moduleNames.add(String(value).trim());
      }
    }
  }
  const names = [...moduleNames].sort((a, b) => a.localeCompare(b));
  if (names.length === 0) {
    const source2 = `import baseConfig from ${JSON.stringify(configUrl)};
export default baseConfig;
`;
    fs5.mkdirSync(path5.dirname(outputFile), { recursive: true });
    fs5.writeFileSync(outputFile, source2, "utf8");
    console.log(`No ${moduleLabel} labels found; preserved caller environments in ${outputFile}`);
    return;
  }
  const usedIds = /* @__PURE__ */ new Set(["default"]);
  const modules = names.map((name) => ({
    id: generateEnvironmentId(name, usedIds),
    name,
    tokens: normalizeModuleTokens(name),
    variables: {}
  }));
  const modulesByName = new Map(modules.map((m) => [m.name, m]));
  const modulesByVariablePrefix = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(allVariables)) {
    const parts = parseVariableParts(key);
    if (!parts || parts.name.toLowerCase() !== "module")
      continue;
    const module2 = modulesByName.get(String(value || "").trim());
    if (!module2)
      continue;
    const previous = modulesByVariablePrefix.get(parts.prefix);
    if (previous && previous !== module2) {
      throw new Error(`Conflicting module declarations for variable prefix ${parts.prefix}`);
    }
    modulesByVariablePrefix.set(parts.prefix, module2);
  }
  const globalVariables = {};
  for (const [key, value] of Object.entries(allVariables)) {
    const parts = parseVariableParts(key);
    const declaredModule = parts ? modulesByVariablePrefix.get(parts.prefix) : null;
    const exactMatches = parts && !declaredModule ? modules.filter((candidate) => tokensEqual(candidate.tokens, parts.moduleTokens)) : [];
    const suffixMatches = parts && !declaredModule && exactMatches.length === 0 ? modules.filter((candidate) => tokensEndWith(candidate.tokens, parts.moduleTokens) || tokensEndWith(parts.moduleTokens, candidate.tokens)) : [];
    const matches = exactMatches.length > 0 ? exactMatches : suffixMatches;
    const module2 = declaredModule || (matches.length === 1 ? matches[0] : null);
    if (module2 && parts?.name)
      module2.variables[parts.name] = String(value);
    else
      globalVariables[key] = String(value);
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
  fs5.mkdirSync(path5.dirname(outputFile), { recursive: true });
  fs5.writeFileSync(outputFile, source, "utf8");
  console.log(`Prepared ${modules.length} module environment(s) from ${moduleLabel}; ${unmatchedResults} result(s) use default environment.`);
}

// dist/commands/module-config.js
async function runModuleConfig(options) {
  await generateModuleConfig(options);
}

// dist/commands/pr-body.js
var fs6 = __toESM(require("node:fs"), 1);

// dist/renderer/markdown.js
function buildReportLink(pagesUrl, forkPr, sourceRunId) {
  if (!pagesUrl || forkPr)
    return "";
  if (!sourceRunId)
    return pagesUrl;
  try {
    const url = new URL(pagesUrl);
    url.searchParams.set("run", sourceRunId);
    return url.toString();
  } catch {
    return `${pagesUrl}${pagesUrl.includes("?") ? "&" : "?"}run=${encodeURIComponent(sourceRunId)}`;
  }
}
function formatSummaryLine(summary) {
  const parts = [
    `${summary.passed} / ${summary.total} tests passed`,
    `${calculatePassRate(summary.passed, summary.total)} pass rate`
  ];
  if (summary.failed > 0)
    parts.push(`${summary.failed} failed`);
  if (summary.broken > 0)
    parts.push(`${summary.broken} broken`);
  if (summary.skipped > 0)
    parts.push(`${summary.skipped} skipped`);
  if (summary.unknown > 0)
    parts.push(`${summary.unknown} unknown`);
  return parts.join(" \xB7 ");
}
function getStatusInfo(total, failed, broken) {
  if (total === 0)
    return { emoji: "\u26AA", label: "no tests" };
  if (failed + broken > 0)
    return { emoji: "\u274C", label: "failures detected" };
  return { emoji: "\u2705", label: "passed" };
}
function renderSummaryTable(summary, reportLink, hasUnknown) {
  const lines = [];
  const columns = hasUnknown ? "| Tests | Passed | Failed | Broken | Skipped | Unknown | Report |" : "| Tests | Passed | Failed | Broken | Skipped | Report |";
  const separator = hasUnknown ? "| ---: | ---: | ---: | ---: | ---: | ---: | :--- |" : "| ---: | ---: | ---: | ---: | ---: | :--- |";
  const reportCell = reportLink ? `[View report \u2197](${reportLink})` : "\u2014";
  const row = (stats, report = "\u2014") => {
    const values = [
      stats.total,
      stats.passed,
      stats.failed,
      stats.broken,
      stats.skipped
    ];
    if (hasUnknown)
      values.push(stats.unknown || 0);
    values.push(report);
    return `| ${values.join(" | ")} |`;
  };
  lines.push(columns, separator, row(summary, reportCell), "");
  return lines;
}
function renderLayerDetails(aggregated, hasUnknown) {
  const lines = [];
  lines.push("<details>");
  lines.push("<summary><strong>Tests by layer</strong></summary>");
  lines.push("");
  const emptyStats2 = {
    total: 0,
    passed: 0,
    failed: 0,
    broken: 0,
    skipped: 0,
    unknown: 0
  };
  lines.push(hasUnknown ? "| Layer | Tests | Passed | Failed | Broken | Skipped | Unknown |" : "| Layer | Tests | Passed | Failed | Broken | Skipped |");
  lines.push(hasUnknown ? "| --- | ---: | ---: | ---: | ---: | ---: | ---: |" : "| --- | ---: | ---: | ---: | ---: | ---: |");
  const epics = ["unit", "api", "ui", "end-to-end", "other"];
  for (const epic of epics) {
    const stats = aggregated.byEpic[epic] || emptyStats2;
    if (stats.total === 0)
      continue;
    const label = EPIC_DISPLAY[epic] || epic;
    const values = [
      label,
      stats.total,
      stats.passed,
      stats.failed,
      stats.broken,
      stats.skipped
    ];
    if (hasUnknown)
      values.push(stats.unknown || 0);
    lines.push(`| ${values.join(" | ")} |`);
  }
  const total = aggregated.total;
  const allValues = [
    "All layers",
    total.total,
    total.passed,
    total.failed,
    total.broken,
    total.skipped
  ];
  if (hasUnknown)
    allValues.push(total.unknown);
  lines.push(`| ${allValues.join(" | ")} |`);
  lines.push("");
  lines.push("</details>");
  lines.push("");
  return lines;
}
function renderFooter(forkPr, reportLink, actionVersion) {
  const lines = [];
  if (forkPr) {
    lines.push("_Preview on GitHub Pages is only published for PRs from the same repository. Download the `allure-report` artifact from this workflow run._", "");
  } else if (!reportLink) {
    lines.push("_GitHub Pages URL not available for this run._", "");
  }
  lines.push(`<sub>Generated by <a href="${ACTION_REPOSITORY_URL}">quokkify/allure-report-action</a> \xB7 <a href="${ACTION_REPOSITORY_URL}/releases/latest">${displayActionVersion(actionVersion)}</a></sub>`, "");
  return lines;
}
function displayActionVersion(version) {
  const normalized = String(version || "").trim();
  if (!normalized)
    return "unversioned";
  return normalized.startsWith("v") ? normalized : `v${normalized}`;
}
function renderPrComment(data) {
  const { summary, aggregated, pagesUrl, forkPr, sourceRunId, actionVersion, commentMarker } = data;
  const status = getStatusInfo(summary.total, summary.failed, summary.broken);
  const reportLink = buildReportLink(pagesUrl, forkPr, sourceRunId);
  const hasUnknown = summary.unknown > 0 || aggregated.total.unknown > 0;
  const lines = [];
  lines.push(`## ${status.emoji} Allure Report \u2014 ${status.label}`, "");
  if (summary.total > 0) {
    lines.push(formatSummaryLine(summary), "");
  } else {
    lines.push("No tests found \xB7 no pass rate", "");
  }
  lines.push(...renderSummaryTable(summary, reportLink, hasUnknown));
  lines.push(...renderLayerDetails(aggregated, hasUnknown));
  lines.push(...renderFooter(forkPr, reportLink, actionVersion));
  lines.push(commentMarker);
  return lines.join("\n");
}

// dist/commands/pr-body.js
async function runPrBody(options) {
  const { resultsDir, reportDir, outputFile, pagesUrl, forkPr, sourceRunId, actionVersion, commentMarker } = options;
  const aggregated = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), (result) => getEpicForResult(result));
  const widget = await readWidgetSummary(reportDir);
  const summary = mergeSummary(await widget, aggregated);
  const data = {
    summary,
    aggregated,
    pagesUrl,
    forkPr,
    sourceRunId,
    actionVersion,
    commentMarker
  };
  const markdown = renderPrComment(data);
  fs6.writeFileSync(outputFile, markdown, "utf8");
  console.log(`Wrote PR body to ${outputFile}`);
}

// dist/commands/prepare-results.js
function runPrepareResults(options) {
  prepareAttributedResults(options);
}

// dist/commands/pyramid-check.js
function runPyramidCheck(options) {
  const { resultsDir, outputJson } = options;
  const aggregated = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), (result) => getEpicForResult(result));
  const { pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal } = aggregated;
  const metrics = {
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal
  };
  const gates = evaluatePyramidQualityGates(metrics);
  const titleBase = "Test pyramid (advisory)";
  for (const warning of gates.warnings) {
    emitGithubWarning(titleBase, `${warning.id}: ${warning.message}`);
  }
  const gateJsonPath = outputJson || "docs/testing/pyramid-quality-gates.json";
  writeQualityGatesJson(gates, metrics, gateJsonPath);
  const markdown = [];
  markdown.push("### Quality gates \u2014 test pyramid (advisory, non-blocking)\n\n");
  markdown.push(formatQualityGatesMarkdownSection(gates, metrics));
  markdown.push("\n");
  appendJobSummary(markdown.join(""));
  console.log(`pyramid-check: ${gates.warnings.length} advisory warning(s), 0 blocking (exit 0).`);
}

// dist/renderer/pyramid.js
var fs7 = __toESM(require("node:fs"), 1);
var path6 = __toESM(require("node:path"), 1);
function pyramidMarkdownEpicColumn(layer) {
  if (layer.id === "api")
    return "`api` / `integration`";
  if (layer.id === "ui_e2e")
    return "`end-to-end` / `ui`";
  return layer.epics.map((e) => `\`${e}\``).join(", ");
}
function pyramidAdvisoryNotes(unitShare, e2eShare, pyramidTotal) {
  if (pyramidTotal === 0) {
    return [
      "- No Allure results in this directory \u2014 pyramid share advisory skipped (run tests or point `--results` at merged CI output)."
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
    lines.push("- Pyramid layer shares sit within the **soft** planning band documented in `docs/testing/test-pyramid.md` (not a merge gate).");
  }
  return lines;
}
function renderPyramidMarkdown(data) {
  const { aggregated, sourceRunId, headSha, policyPath, outputMd } = data;
  const { layers, pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal } = aggregated;
  const gates = evaluatePyramidQualityGates({
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal
  });
  const generatedAt = (/* @__PURE__ */ new Date()).toISOString();
  const md = [];
  md.push("# Test pyramid snapshot");
  md.push("");
  md.push(`_Generated: \`${generatedAt}\`_`);
  if (sourceRunId) {
    md.push(`_Source workflow run id: \`${sourceRunId}\`_`);
  }
  if (headSha) {
    md.push(`_Head SHA: \`${headSha.slice(0, 7)}\`_`);
  }
  md.push("");
  md.push("## Counts by layer (`epic` / Allure `layer`)");
  md.push("");
  md.push("| Layer | `epic` / `layer` | Cases | Passed | Failed | Broken | Skipped |");
  md.push("| --- | --- | --: | --: | --: | --: | --: |");
  for (const L of layers) {
    const s = L.stats;
    const epicCol = pyramidMarkdownEpicColumn(L);
    md.push(`| ${L.label} | ${epicCol} | **${s.total}** | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} |`);
  }
  md.push(`| **\u03A3 pyramid layers** | | **${pyramidTotal}** | | | | |`);
  md.push("");
  if (otherEpicTotal > 0) {
    md.push(`> **No epic assigned:** ${otherEpicTotal} case(s) \u2014 assign \`epic\` in Vitest/pytest/Playwright setup so they roll into the pyramid.`);
    md.push("");
  }
  md.push("## Shares (pyramid layers only)");
  md.push("");
  if (pyramidTotal === 0) {
    md.push("_No results in the given directory \u2014 nothing to chart._");
  } else {
    md.push("| Layer | Share of \u03A3 layers |");
    md.push("| --- | ---: |");
    for (const L of layers) {
      const pct = 100 * L.stats.total / pyramidTotal;
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
  md.push(formatQualityGatesMarkdownSection(gates, {
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal
  }));
  if (policyPath && outputMd) {
    const policyHref = path6.relative(path6.resolve(path6.dirname(outputMd)), path6.resolve(policyPath)).split(path6.sep).join("/");
    md.push(`Canonical policy: [\`${policyPath}\`](${policyHref}).`);
  }
  return md.join("\n");
}
function generatePyramidJson(data) {
  const { aggregated, sourceRunId, headSha } = data;
  const { layers, pyramidTotal, unitShare, apiShare, e2eShare, otherEpicTotal, total } = aggregated;
  const gates = evaluatePyramidQualityGates({
    pyramidTotal,
    unitShare,
    apiShare,
    e2eShare,
    otherEpicTotal
  });
  return {
    schemaVersion: 1,
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    source: {
      workflowRunId: sourceRunId || null,
      headSha: headSha || null
    },
    pyramidLayerTotals: Object.fromEntries(layers.map((L) => [L.id, L.stats.total])),
    pyramidTotal,
    otherEpicTotal,
    allureGrandTotal: total.total,
    shares: pyramidTotal ? { unit: unitShare, api: apiShare, ui_e2e: e2eShare } : { unit: 0, api: 0, ui_e2e: 0 },
    advisory: { ...PYRAMID_ADVISORY },
    qualityGates: {
      advisoryOnly: gates.advisoryOnly,
      warnings: gates.warnings,
      blockingFailures: gates.blockingFailures
    }
  };
}
function writePyramidFiles(markdown, json, markdownPath, jsonPath) {
  fs7.mkdirSync(path6.dirname(markdownPath), { recursive: true });
  fs7.writeFileSync(markdownPath, markdown, "utf8");
  console.log(`Wrote ${markdownPath}`);
  if (jsonPath) {
    fs7.mkdirSync(path6.dirname(jsonPath), { recursive: true });
    fs7.writeFileSync(jsonPath, JSON.stringify(json, null, 2), "utf8");
    console.log(`Wrote ${jsonPath}`);
  }
}

// dist/commands/pyramid.js
function runPyramid(options) {
  const { resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha } = options;
  const aggregated = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), (result) => getEpicForResult(result));
  const data = {
    aggregated,
    sourceRunId,
    headSha,
    policyPath,
    outputMd
  };
  const markdown = renderPyramidMarkdown(data);
  const json = generatePyramidJson(data);
  writePyramidFiles(markdown, json, outputMd, outputJson || "");
}

// dist/cli.js
function parseArgs(argv) {
  return {
    command: argv[2] ?? "",
    args: argv.slice(3)
  };
}
function getArg(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : void 0;
  return value ?? "";
}
function getFlag(args, name) {
  return args.includes(name);
}
async function main() {
  const { command, args } = parseArgs(process.argv);
  try {
    switch (command) {
      case "sanitize-results": {
        sanitizeResults({ inputDir: getArg(args, "--input"), outputDir: getArg(args, "--output") });
        break;
      }
      case "prepare-results": {
        const sourceRoot = getArg(args, "--source-root") || "";
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const moduleLabel = getArg(args, "--module-label") || "module";
        const autoMode = getFlag(args, "--auto");
        runPrepareResults({ sourceRoot, resultsDir, moduleLabel, autoMode });
        break;
      }
      case "module-config": {
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const configFile = getArg(args, "--config") || "./allurerc.mjs";
        const outputFile = getArg(args, "--output") || "./effective-allurerc.mjs";
        const moduleLabel = getArg(args, "--module-label") || "module";
        await runModuleConfig({ resultsDir, configFile, outputFile, moduleLabel });
        break;
      }
      case "badges": {
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const reportDir = getArg(args, "--out") || "./allure-report";
        runBadges({ resultsDir, reportDir });
        break;
      }
      case "pr-body": {
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const reportDir = getArg(args, "--report") || "./allure-report";
        const outputFile = getArg(args, "--output") || "./allure-pr-comment.md";
        const pagesUrl = getArg(args, "--pages-url") || "";
        const forkPr = getFlag(args, "--fork-pr");
        const sourceRunId = getArg(args, "--source-run-id") || "";
        const actionVersion = getArg(args, "--action-version") || "";
        const commentMarker = getArg(args, "--comment-marker") || "<!-- project-toolkit-allure-ci -->";
        runPrBody({
          resultsDir,
          reportDir,
          outputFile,
          pagesUrl,
          forkPr,
          sourceRunId,
          actionVersion,
          commentMarker
        });
        break;
      }
      case "pyramid": {
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const outputMd = getArg(args, "--output") || "./pyramid.md";
        const outputJson = getArg(args, "--json") || "";
        const policyPath = getArg(args, "--policy-path") || void 0;
        const sourceRunId = getArg(args, "--source-run-id") || void 0;
        const headSha = getArg(args, "--head-sha") || void 0;
        runPyramid({ resultsDir, outputMd, outputJson, policyPath, sourceRunId, headSha });
        break;
      }
      case "pyramid-check": {
        const resultsDir = getArg(args, "--results") || "./allure-results";
        const outputJson = getArg(args, "--json") || "./pyramid-gates.json";
        runPyramidCheck({ resultsDir, outputJson });
        break;
      }
      default:
        console.error("Usage: node cli.cjs <command> [options]");
        console.error("Commands: sanitize-results, prepare-results, module-config, badges, pr-body, pyramid, pyramid-check");
        process.exit(1);
    }
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
main();
//# sourceMappingURL=cli.cjs.map
