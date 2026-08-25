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
import { createHash } from "node:crypto";
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

const SOURCE_SCAN_SKIP_DIRECTORIES = new Set([
  ".git",
  ".gradle",
  ".idea",
  ".venv",
  "allure-report",
  "dist",
  "node_modules",
  "venv",
]);
const MAX_SOURCE_FILES = 100_000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 256 * 1024 * 1024;
const MAX_FRAGMENT_BYTES = 1024 * 1024;
const MAX_FRAGMENT_VARIABLES = 10_000;
const MAX_FRAGMENT_VARIABLE_BYTES = 4 * 1024 * 1024;
const MAX_PRESERVED_METADATA_BYTES = 16 * 1024 * 1024;
const PRESERVED_DESTINATION_METADATA = ["environment.properties", "executor.json"];
const MODULE_VARIABLES_METADATA = ".allure-module-variables.json";

function parseModuleFragment(fragmentPath) {
  const stat = fs.lstatSync(fragmentPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Module provenance must be a regular file: ${fragmentPath}`);
  }
  if (stat.size > MAX_FRAGMENT_BYTES) {
    throw new Error(`Module provenance exceeds ${MAX_FRAGMENT_BYTES} bytes: ${fragmentPath}`);
  }
  const modules = new Set();
  const variables = new Map();
  for (const rawLine of fs.readFileSync(fragmentPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (
      !key ||
      key === "__proto__" ||
      key.length > 512 ||
      value.length > 8192 ||
      /[\u0000-\u001f\u007f]/.test(key) ||
      /[\u0000-\u001f\u007f]/.test(value)
    ) {
      throw new Error(`Invalid environment variable in ${fragmentPath}`);
    }
    const previous = variables.get(key);
    if (previous !== undefined && previous !== value) {
      throw new Error(`Conflicting environment variable ${key} in ${fragmentPath}`);
    }
    variables.set(key, value);
    if ((key === "Module" || key.endsWith(".Module")) && value) modules.add(value);
  }
  if (modules.size !== 1) {
    const detail = modules.size === 0 ? "none" : [...modules].sort().join(", ");
    throw new Error(`Expected exactly one module value in ${fragmentPath}; found ${detail}`);
  }
  const moduleName = [...modules][0];
  if (moduleName.length > 512 || /[\u0000-\u001f\u007f]/.test(moduleName)) {
    throw new Error(`Invalid module value in ${fragmentPath}`);
  }
  return { moduleName, variables };
}

function readModuleVariables(resultsDir) {
  const metadata = path.join(resultsDir, MODULE_VARIABLES_METADATA);
  if (!fs.existsSync(metadata)) return {};
  const stat = fs.lstatSync(metadata);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FRAGMENT_VARIABLE_BYTES) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  let document;
  try {
    document = JSON.parse(fs.readFileSync(metadata, "utf8"));
  } catch {
    throw new Error(`Malformed module environment metadata: ${metadata}`);
  }
  if (!document || typeof document !== "object" || Array.isArray(document)) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  const entries = Object.entries(document);
  if (
    entries.length > MAX_FRAGMENT_VARIABLES ||
    entries.some(([key, value]) =>
      !key ||
      key === "__proto__" ||
      key.length > 512 ||
      typeof value !== "string" ||
      value.length > 8192 ||
      /[\u0000-\u001f\u007f]/.test(key) ||
      /[\u0000-\u001f\u007f]/.test(value)
    )
  ) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  return document;
}

function findSourceResultDirectories(sourceRoot, resultsDir) {
  const root = path.resolve(sourceRoot);
  const destination = path.resolve(resultsDir);
  if (!fs.existsSync(root)) throw new Error(`Source artifacts directory not found: ${sourceRoot}`);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Source artifacts path must be a regular directory: ${sourceRoot}`);
  }

  const sources = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop();
    if (directory === destination) continue;
    if (path.basename(directory) === "allure-results") {
      sources.push(directory);
      continue;
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed: ${child}`);
      if (!entry.isDirectory()) continue;
      if (SOURCE_SCAN_SKIP_DIRECTORIES.has(entry.name)) continue;
      stack.push(child);
    }
  }
  return sources.sort();
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
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
  if (document.labels !== undefined && !Array.isArray(document.labels)) {
    throw new Error(`Allure result labels must be an array: ${file}`);
  }
  const labels = (document.labels || []).filter(
    (label) => !label || label.name !== moduleLabel,
  );
  labels.push({ name: moduleLabel, value: moduleName });
  document.labels = labels;
  return Buffer.from(`${JSON.stringify(document)}\n`, "utf8");
}

function prepareAttributedResults(sourceRoot, resultsDir, moduleLabel, autoMode) {
  if (!sourceRoot.trim()) throw new Error("--source-root must not be empty");
  if (!moduleLabel.trim()) throw new Error("--module-label must not be empty in attributed mode");
  const destination = path.resolve(resultsDir);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, `.${path.basename(destination)}-prepare-`));
  const backup = path.join(
    parent,
    `.${path.basename(destination)}-backup-${process.pid}-${Date.now()}`,
  );
  let destinationMoved = false;
  let sourceDirectories = 0;
  let sourceFiles = 0;
  let sourceBytes = 0;
  let attributedResults = 0;
  let fragmentVariableBytes = 0;
  const staged = new Map();
  const fragmentVariables = new Map();

  const stage = (name, data, mode, source) => {
    const digest = sha256(data);
    const previous = staged.get(name);
    if (previous) {
      if (previous.digest === digest) return;
      throw new Error(`Conflicting source files named ${name}: ${previous.source} and ${source}`);
    }
    fs.writeFileSync(path.join(temporary, name), data, { flag: "wx", mode });
    staged.set(name, { digest, source });
  };

  try {
    const sourceDirectoriesFound = findSourceResultDirectories(sourceRoot, resultsDir);
    const withProvenance = sourceDirectoriesFound.filter((directory) =>
      fs.existsSync(path.join(directory, "ci-env-fragment.properties")),
    );
    if (autoMode && withProvenance.length === 0) {
      fs.rmSync(temporary, { recursive: true, force: true });
      process.stdout.write("No attributed source results detected; preserved legacy merged results\n");
      return;
    }
    if (sourceDirectoriesFound.length === 0) {
      throw new Error(`No source allure-results directories found under ${sourceRoot}`);
    }
    if (withProvenance.length !== sourceDirectoriesFound.length) {
      throw new Error(
        `Partial module provenance: ${withProvenance.length} of ${sourceDirectoriesFound.length} source directories contain ci-env-fragment.properties`,
      );
    }

    if (fs.existsSync(destination)) {
      const destinationStat = fs.lstatSync(destination);
      if (!destinationStat.isDirectory() || destinationStat.isSymbolicLink()) {
        throw new Error(`Results destination must be a regular directory: ${resultsDir}`);
      }
      for (const name of PRESERVED_DESTINATION_METADATA) {
        const file = path.join(destination, name);
        if (!fs.existsSync(file)) continue;
        const stat = fs.lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink()) {
          throw new Error(`Preserved metadata must be a regular file: ${file}`);
        }
        if (stat.size > MAX_PRESERVED_METADATA_BYTES) {
          throw new Error(
            `Preserved metadata exceeds ${MAX_PRESERVED_METADATA_BYTES} bytes: ${file}`,
          );
        }
        stage(name, fs.readFileSync(file), stat.mode & 0o777, file);
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
        if (previous !== undefined && previous !== value) {
          throw new Error(`Conflicting environment variable ${key} across source fragments`);
        }
        if (previous === undefined) {
          fragmentVariableBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
          if (
            fragmentVariables.size >= MAX_FRAGMENT_VARIABLES ||
            fragmentVariableBytes > MAX_FRAGMENT_VARIABLE_BYTES
          ) {
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
        if (entry.name === "ci-env-fragment.properties") continue;
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
          throw new Error(
            `Source results exceed limits (${MAX_SOURCE_FILES} files / ${MAX_SOURCE_BYTES} bytes)`,
          );
        }
        const data = entry.name.endsWith("-result.json")
          ? attributedResultBuffer(file, moduleName, moduleLabel)
          : fs.readFileSync(file);
        if (entry.name.endsWith("-result.json")) attributedResults += 1;
        stage(entry.name, data, stat.mode & 0o777, file);
      }
    }

    if (attributedResults === 0) throw new Error("No Allure result JSON files found in source artifacts");
    const environmentMetadata = Buffer.from(
      JSON.stringify(Object.fromEntries([...fragmentVariables].sort(([left], [right]) =>
        left.localeCompare(right)
      ))),
      "utf8",
    );
    if (environmentMetadata.length > MAX_FRAGMENT_VARIABLE_BYTES) {
      throw new Error("Module environment metadata exceeds byte limit");
    }
    stage(MODULE_VARIABLES_METADATA, environmentMetadata, 0o600, "source fragments");
    if (fs.existsSync(destination)) {
      fs.renameSync(destination, backup);
      destinationMoved = true;
    }
    fs.renameSync(temporary, destination);
    if (destinationMoved) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    if (destinationMoved && !fs.existsSync(destination) && fs.existsSync(backup)) {
      fs.renameSync(backup, destination);
    }
    throw error;
  }

  process.stdout.write(
    `Prepared ${attributedResults} attributed result(s) from ${sourceDirectories} source directories (${sourceFiles} files)\n`,
  );
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
  const prefix = key.slice(0, index).trim();
  if (!prefix) return null;
  return {
    prefix,
    moduleTokens: normalizedModuleTokens(prefix),
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

async function cmdModuleConfig(resultsDir, configFile, outputFile, moduleLabel) {
  if (!moduleLabel.trim()) {
    throw new Error("--module-label must not be empty");
  }
  const configPath = path.resolve(configFile);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Allure config not found: ${configFile}`);
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
  const modulesByName = new Map(modules.map((module) => [module.name, module]));
  const modulesByVariablePrefix = new Map();
  for (const [key, value] of Object.entries(allVariables)) {
    const parts = moduleVariableParts(key);
    if (!parts || parts.name.toLowerCase() !== "module") continue;
    const module = modulesByName.get(String(value || "").trim());
    if (!module) continue;
    const previous = modulesByVariablePrefix.get(parts.prefix);
    if (previous && previous !== module) {
      throw new Error(`Conflicting module declarations for variable prefix ${parts.prefix}`);
    }
    modulesByVariablePrefix.set(parts.prefix, module);
  }
  const globalVariables = {};
  for (const [key, value] of Object.entries(allVariables)) {
    const parts = moduleVariableParts(key);
    const declaredModule = parts ? modulesByVariablePrefix.get(parts.prefix) : null;
    const exactMatches = parts && !declaredModule
      ? modules.filter((candidate) => tokensEqual(candidate.tokens, parts.moduleTokens))
      : [];
    const suffixMatches =
      parts && !declaredModule && exactMatches.length === 0
        ? modules.filter(
            (candidate) =>
              tokensEndWith(candidate.tokens, parts.moduleTokens) ||
              tokensEndWith(parts.moduleTokens, candidate.tokens),
          )
        : [];
    const matches = exactMatches.length > 0 ? exactMatches : suffixMatches;
    const module = declaredModule || (matches.length === 1 ? matches[0] : null);
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

  const status = total === 0 ? "⚪" : failed + broken > 0 ? "❌" : "✅";
  const statusLabel = total === 0 ? "no tests" : failed + broken > 0 ? "failures detected" : "passed";
  const lines = [`## ${status} Allure Report — ${statusLabel}`, ""];
  if (total > 0) {
    const parts = [`${passed} / ${total} tests passed`, `${passRatePercent({ passed, total })} pass rate`];
    if (failed > 0) parts.push(`${failed} failed`);
    if (broken > 0) parts.push(`${broken} broken`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    if (unknown > 0) parts.push(`${unknown} unknown`);
    lines.push(parts.join(" · "), "");
  } else {
    lines.push("No tests found · no pass rate", "");
  }

  const reportLink = (() => {
    if (!pagesUrl || forkPr === "true") return "";
    if (!sourceRunId) return pagesUrl;
    try {
      const url = new URL(pagesUrl);
      url.searchParams.set("run", sourceRunId);
      return url.toString();
    } catch {
      return `${pagesUrl}${pagesUrl.includes("?") ? "&" : "?"}run=${encodeURIComponent(sourceRunId)}`;
    }
  })();
  const reportCell = reportLink ? `[View report ↗](${reportLink})` : "—";
  const hasUnknown = unknown > 0 || agg.total.unknown > 0;
  const columns = hasUnknown
    ? "| Tests | Passed | Failed | Broken | Skipped | Unknown | Report |"
    : "| Tests | Passed | Failed | Broken | Skipped | Report |";
  const separator = hasUnknown
    ? "| ---: | ---: | ---: | ---: | ---: | ---: | :--- |"
    : "| ---: | ---: | ---: | ---: | ---: | :--- |";
  const row = (stats, report = "—") => {
    const values = [stats.total, stats.passed, stats.failed, stats.broken, stats.skipped];
    if (hasUnknown) values.push(stats.unknown || 0);
    values.push(report);
    return `| ${values.join(" | ")} |`;
  };

  lines.push(columns, separator, row({ total, passed, failed, broken, skipped, unknown }, reportCell), "");

  lines.push("<details>");
  lines.push("<summary><strong>Tests by layer</strong></summary>");
  lines.push("");
  lines.push(
    hasUnknown
      ? "| Layer | Tests | Passed | Failed | Broken | Skipped | Unknown |"
      : "| Layer | Tests | Passed | Failed | Broken | Skipped |",
  );
  lines.push(hasUnknown ? "| --- | ---: | ---: | ---: | ---: | ---: | ---: |" : "| --- | ---: | ---: | ---: | ---: | ---: |");

  const empty = { total: 0, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
  for (const epic of EPICS) {
    const s = agg.byEpic[epic] || empty;
    if (s.total === 0) continue;
    const label = EPIC_DISPLAY[epic] || epic;
    const values = [label, s.total, s.passed, s.failed, s.broken, s.skipped];
    if (hasUnknown) values.push(s.unknown || 0);
    lines.push(`| ${values.join(" | ")} |`);
  }
  const other = agg.byEpic.other;
  if (other && other.total > 0) {
    const values = [EPIC_DISPLAY.other, other.total, other.passed, other.failed, other.broken, other.skipped];
    if (hasUnknown) values.push(other.unknown || 0);
    lines.push(`| ${values.join(" | ")} |`);
  }
  const t = agg.total;
  const allValues = ["All layers", t.total, t.passed, t.failed, t.broken, t.skipped];
  if (hasUnknown) allValues.push(t.unknown);
  lines.push(`| ${allValues.join(" | ")} |`);
  lines.push("");
  lines.push("</details>");
  lines.push("");
  if (forkPr === "true") {
    lines.push(
      "_Preview on GitHub Pages is only published for PRs from the same repository. Download the `allure-report` artifact from this workflow run._",
      "",
    );
  } else if (!reportLink) {
    lines.push("_GitHub Pages URL not available for this run._", "");
  }
  lines.push(`<sub>Generated by <a href="${ACTION_REPOSITORY_URL}">quokkify/allure-report-action</a> · <a href="${ACTION_REPOSITORY_URL}/releases/latest">${displayActionVersion(actionVersion)}</a></sub>`);
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
    autoSource: get("--auto") === "true",
    moduleLabel: get("--module-label") || "module",
    sourceRoot: get("--source-root") || "",
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
  autoSource,
  moduleLabel,
  sourceRoot,
  commentMarker,
  json,
  readme,
  policyPath,
} = parseArgs(process.argv);

if (cmd === "module-config") {
  await cmdModuleConfig(results, config, output, moduleLabel);
} else if (cmd === "prepare-results") {
  prepareAttributedResults(sourceRoot, results, moduleLabel, autoSource);
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
      "       node allure-ci.mjs prepare-results --source-root <dir> --results <dir> [--auto true|false] [--module-label module]\n" +
      "       node allure-ci.mjs module-config --results <dir> --config <allurerc.mjs> --output <effective.mjs> [--module-label module]\n" +
      "       node allure-ci.mjs pr-body --results <dir> --report <reportDir> --output <file> [--pages-url <url>] [--fork-pr true|false] [--source-run-id <id>] [--action-version <version>]\n" +
      "       node allure-ci.mjs pyramid --results <dir> --output <file.md> [--json <file.json>] [--readme README.md] [--policy-path <file.md>]\n" +
      "       node allure-ci.mjs pyramid-check --results <dir> [--json <quality-gates.json>]",
  );
  process.exit(1);
}
