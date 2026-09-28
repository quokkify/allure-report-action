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
function normalizeResultTimestamps(document) {
  const start = typeof document.start === "number" && document.start > 0 ? document.start : 1;
  const normalizedStart = Math.floor(start);
  const stop = typeof document.stop === "number" && document.stop > 0 ? document.stop : start + 1;
  document.start = normalizedStart;
  document.stop = Math.max(normalizedStart + 1, Math.ceil(stop));
}
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
  const environments = /* @__PURE__ */ new Set();
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
    if ((key === "Environment" || key.endsWith(".Environment")) && value)
      environments.add(value);
  }
  if (modules.size !== 1) {
    const detail = modules.size === 0 ? "none" : [...modules].sort().join(", ");
    throw new Error(`Expected exactly one module value in ${fragmentPath}; found ${detail}`);
  }
  const moduleArray = [...modules];
  return {
    moduleName: moduleArray[0],
    environmentName: environments.size === 1 ? [...environments][0] : moduleArray[0],
    hasEnvironment: environments.size === 1,
    variables
  };
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
function attributedResultBuffer(file, moduleName, environmentName, hasEnvironment, moduleLabel, environmentLabel) {
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
  if (hasEnvironment)
    labels.push({ name: environmentLabel, value: environmentName });
  document.labels = labels;
  normalizeResultTimestamps(document);
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
function pathContains(parent, child) {
  const relative4 = path.relative(parent, child);
  return relative4 === "" || !path.isAbsolute(relative4) && relative4 !== ".." && !relative4.startsWith(`..${path.sep}`);
}
function collectAttachmentReferences(node, inputName, referenced) {
  if (!node || typeof node !== "object" || Array.isArray(node)) {
    throw new Error(`Malformed executable node in ${inputName}`);
  }
  const executable = node;
  if (executable.attachments !== void 0 && !Array.isArray(executable.attachments)) {
    throw new Error(`Malformed attachment references: ${inputName}`);
  }
  for (const attachment of executable.attachments ?? []) {
    if (!attachment || typeof attachment !== "object" || Array.isArray(attachment) || typeof attachment.source !== "string" || !safeResultName(attachment.source)) {
      throw new Error(`Malformed attachment reference in ${inputName}`);
    }
    referenced.add(attachment.source);
  }
  if (executable.steps !== void 0 && !Array.isArray(executable.steps)) {
    throw new Error(`Malformed executable steps in ${inputName}`);
  }
  for (const step of executable.steps ?? []) {
    collectAttachmentReferences(step, inputName, referenced);
  }
}
function sanitizeResults(options) {
  if (!options.inputDir.trim())
    throw new Error("--input must not be empty");
  if (!options.outputDir.trim())
    throw new Error("--output must not be empty");
  const input = path.resolve(options.inputDir);
  const output = path.resolve(options.outputDir);
  if (pathContains(input, output) || pathContains(output, input)) {
    throw new Error("Sanitized Allure results directory must not overlap the input directory");
  }
  const inputStat = fs.lstatSync(input);
  if (!inputStat.isDirectory() || inputStat.isSymbolicLink()) {
    throw new Error(`Allure results input must be a regular directory: ${options.inputDir}`);
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
        normalizeResultTimestamps(document);
        regular.set(entry.name, Buffer.from(`${JSON.stringify(document)}
`, "utf8"));
        collectAttachmentReferences(document, entry.name, referenced);
      } else {
        const container = document;
        for (const property of ["befores", "afters"]) {
          const fixtures = container[property];
          if (fixtures !== void 0 && !Array.isArray(fixtures)) {
            throw new Error(`Malformed container ${property}: ${entry.name}`);
          }
          for (const fixture of fixtures ?? []) {
            collectAttachmentReferences(fixture, entry.name, referenced);
          }
        }
      }
    }
    if (!entry.name.endsWith("-result.json"))
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
  const { sourceRoot, resultsDir, moduleLabel, environmentLabel = "environment", autoMode } = options;
  if (!sourceRoot.trim())
    throw new Error("--source-root must not be empty");
  if (!moduleLabel.trim())
    throw new Error("--module-label must not be empty in attributed mode");
  if (!environmentLabel.trim())
    throw new Error("--environment-label must not be empty in attributed mode");
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
      const { moduleName, environmentName, hasEnvironment, variables } = parseModuleFragment(fragment);
      for (const [key, value] of variables) {
        const scopedKey = hasEnvironment ? `${environmentName}::${key}` : key;
        const previous = fragmentVariables.get(scopedKey);
        if (previous !== void 0 && previous !== value) {
          throw new Error(`Conflicting environment variable ${key} across source fragments`);
        }
        if (previous === void 0) {
          fragmentVariableBytes += Buffer.byteLength(key) + Buffer.byteLength(value);
          if (fragmentVariables.size >= MAX_FRAGMENT_VARIABLES || fragmentVariableBytes > MAX_FRAGMENT_VARIABLE_BYTES) {
            throw new Error("Module environment variables exceed count or byte limits");
          }
          fragmentVariables.set(scopedKey, value);
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
        const data = entry.name.endsWith("-result.json") ? attributedResultBuffer(file, moduleName, environmentName, hasEnvironment, moduleLabel, environmentLabel) : fs.readFileSync(file);
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
var import_node_fs2 = require("node:fs");
var import_node_path3 = __toESM(require("node:path"), 1);

// node_modules/@allurereport/ci/dist/reportContext.js
var import_node_fs = require("node:fs");
var import_promises2 = require("node:fs/promises");
var import_node_path2 = require("node:path");

// node_modules/glob/dist/esm/index.min.js
var import_node_url = require("node:url");
var import_node_path = require("node:path");
var import_node_url2 = require("node:url");
var import_fs = require("fs");
var xi = __toESM(require("node:fs"), 1);
var import_promises = require("node:fs/promises");
var import_node_events = require("node:events");
var import_node_stream = __toESM(require("node:stream"), 1);
var import_node_string_decoder = require("node:string_decoder");
var Gt = (n7, t, e) => {
  let s = n7 instanceof RegExp ? ce(n7, e) : n7, i = t instanceof RegExp ? ce(t, e) : t, r = s !== null && i != null && ss(s, i, e);
  return r && { start: r[0], end: r[1], pre: e.slice(0, r[0]), body: e.slice(r[0] + s.length, r[1]), post: e.slice(r[1] + i.length) };
};
var ce = (n7, t) => {
  let e = t.match(n7);
  return e ? e[0] : null;
};
var ss = (n7, t, e) => {
  let s, i, r, o, h, a = e.indexOf(n7), l = e.indexOf(t, a + 1), u = a;
  if (a >= 0 && l > 0) {
    if (n7 === t) return [a, l];
    for (s = [], r = e.length; u >= 0 && !h; ) {
      if (u === a) s.push(u), a = e.indexOf(n7, u + 1);
      else if (s.length === 1) {
        let c = s.pop();
        c !== void 0 && (h = [c, l]);
      } else i = s.pop(), i !== void 0 && i < r && (r = i, o = l), l = e.indexOf(t, u + 1);
      u = a < l && a >= 0 ? a : l;
    }
    s.length && o !== void 0 && (h = [r, o]);
  }
  return h;
};
var fe = "\0SLASH" + Math.random() + "\0";
var ue = "\0OPEN" + Math.random() + "\0";
var qt = "\0CLOSE" + Math.random() + "\0";
var de = "\0COMMA" + Math.random() + "\0";
var pe = "\0PERIOD" + Math.random() + "\0";
var is = new RegExp(fe, "g");
var rs = new RegExp(ue, "g");
var ns = new RegExp(qt, "g");
var os = new RegExp(de, "g");
var hs = new RegExp(pe, "g");
var as = /\\\\/g;
var ls = /\\{/g;
var cs = /\\}/g;
var fs3 = /\\,/g;
var us = /\\./g;
var ds = 1e5;
function Ht(n7) {
  return isNaN(n7) ? n7.charCodeAt(0) : parseInt(n7, 10);
}
function ps(n7) {
  return n7.replace(as, fe).replace(ls, ue).replace(cs, qt).replace(fs3, de).replace(us, pe);
}
function ms(n7) {
  return n7.replace(is, "\\").replace(rs, "{").replace(ns, "}").replace(os, ",").replace(hs, ".");
}
function me(n7) {
  if (!n7) return [""];
  let t = [], e = Gt("{", "}", n7);
  if (!e) return n7.split(",");
  let { pre: s, body: i, post: r } = e, o = s.split(",");
  o[o.length - 1] += "{" + i + "}";
  let h = me(r);
  return r.length && (o[o.length - 1] += h.shift(), o.push.apply(o, h)), t.push.apply(t, o), t;
}
function ge(n7, t = {}) {
  if (!n7) return [];
  let { max: e = ds } = t;
  return n7.slice(0, 2) === "{}" && (n7 = "\\{\\}" + n7.slice(2)), ht(ps(n7), e, true).map(ms);
}
function gs(n7) {
  return "{" + n7 + "}";
}
function ws(n7) {
  return /^-?0\d/.test(n7);
}
function ys(n7, t) {
  return n7 <= t;
}
function bs(n7, t) {
  return n7 >= t;
}
function ht(n7, t, e) {
  let s = [], i = Gt("{", "}", n7);
  if (!i) return [n7];
  let r = i.pre, o = i.post.length ? ht(i.post, t, false) : [""];
  if (/\$$/.test(i.pre)) for (let h = 0; h < o.length && h < t; h++) {
    let a = r + "{" + i.body + "}" + o[h];
    s.push(a);
  }
  else {
    let h = /^-?\d+\.\.-?\d+(?:\.\.-?\d+)?$/.test(i.body), a = /^[a-zA-Z]\.\.[a-zA-Z](?:\.\.-?\d+)?$/.test(i.body), l = h || a, u = i.body.indexOf(",") >= 0;
    if (!l && !u) return i.post.match(/,(?!,).*\}/) ? (n7 = i.pre + "{" + i.body + qt + i.post, ht(n7, t, true)) : [n7];
    let c;
    if (l) c = i.body.split(/\.\./);
    else if (c = me(i.body), c.length === 1 && c[0] !== void 0 && (c = ht(c[0], t, false).map(gs), c.length === 1)) return o.map((f) => i.pre + c[0] + f);
    let d;
    if (l && c[0] !== void 0 && c[1] !== void 0) {
      let f = Ht(c[0]), m = Ht(c[1]), p = Math.max(c[0].length, c[1].length), w = c.length === 3 && c[2] !== void 0 ? Math.abs(Ht(c[2])) : 1, g = ys;
      m < f && (w *= -1, g = bs);
      let E = c.some(ws);
      d = [];
      for (let y = f; g(y, m); y += w) {
        let b;
        if (a) b = String.fromCharCode(y), b === "\\" && (b = "");
        else if (b = String(y), E) {
          let z = p - b.length;
          if (z > 0) {
            let $ = new Array(z + 1).join("0");
            y < 0 ? b = "-" + $ + b.slice(1) : b = $ + b;
          }
        }
        d.push(b);
      }
    } else {
      d = [];
      for (let f = 0; f < c.length; f++) d.push.apply(d, ht(c[f], t, false));
    }
    for (let f = 0; f < d.length; f++) for (let m = 0; m < o.length && s.length < t; m++) {
      let p = r + d[f] + o[m];
      (!e || l || p) && s.push(p);
    }
  }
  return s;
}
var at = (n7) => {
  if (typeof n7 != "string") throw new TypeError("invalid pattern");
  if (n7.length > 65536) throw new TypeError("pattern is too long");
};
var Ss = { "[:alnum:]": ["\\p{L}\\p{Nl}\\p{Nd}", true], "[:alpha:]": ["\\p{L}\\p{Nl}", true], "[:ascii:]": ["\\x00-\\x7f", false], "[:blank:]": ["\\p{Zs}\\t", true], "[:cntrl:]": ["\\p{Cc}", true], "[:digit:]": ["\\p{Nd}", true], "[:graph:]": ["\\p{Z}\\p{C}", true, true], "[:lower:]": ["\\p{Ll}", true], "[:print:]": ["\\p{C}", true], "[:punct:]": ["\\p{P}", true], "[:space:]": ["\\p{Z}\\t\\r\\n\\v\\f", true], "[:upper:]": ["\\p{Lu}", true], "[:word:]": ["\\p{L}\\p{Nl}\\p{Nd}\\p{Pc}", true], "[:xdigit:]": ["A-Fa-f0-9", false] };
var lt = (n7) => n7.replace(/[[\]\\-]/g, "\\$&");
var Es = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var we = (n7) => n7.join("");
var ye = (n7, t) => {
  let e = t;
  if (n7.charAt(e) !== "[") throw new Error("not in a brace expression");
  let s = [], i = [], r = e + 1, o = false, h = false, a = false, l = false, u = e, c = "";
  t: for (; r < n7.length; ) {
    let p = n7.charAt(r);
    if ((p === "!" || p === "^") && r === e + 1) {
      l = true, r++;
      continue;
    }
    if (p === "]" && o && !a) {
      u = r + 1;
      break;
    }
    if (o = true, p === "\\" && !a) {
      a = true, r++;
      continue;
    }
    if (p === "[" && !a) {
      for (let [w, [g, S, E]] of Object.entries(Ss)) if (n7.startsWith(w, r)) {
        if (c) return ["$.", false, n7.length - e, true];
        r += w.length, E ? i.push(g) : s.push(g), h = h || S;
        continue t;
      }
    }
    if (a = false, c) {
      p > c ? s.push(lt(c) + "-" + lt(p)) : p === c && s.push(lt(p)), c = "", r++;
      continue;
    }
    if (n7.startsWith("-]", r + 1)) {
      s.push(lt(p + "-")), r += 2;
      continue;
    }
    if (n7.startsWith("-", r + 1)) {
      c = p, r += 2;
      continue;
    }
    s.push(lt(p)), r++;
  }
  if (u < r) return ["", false, 0, false];
  if (!s.length && !i.length) return ["$.", false, n7.length - e, true];
  if (i.length === 0 && s.length === 1 && /^\\?.$/.test(s[0]) && !l) {
    let p = s[0].length === 2 ? s[0].slice(-1) : s[0];
    return [Es(p), false, u - e, false];
  }
  let d = "[" + (l ? "^" : "") + we(s) + "]", f = "[" + (l ? "" : "^") + we(i) + "]";
  return [s.length && i.length ? "(" + d + "|" + f + ")" : s.length ? d : f, h, u - e, true];
};
var W = (n7, { windowsPathsNoEscape: t = false, magicalBraces: e = true } = {}) => e ? t ? n7.replace(/\[([^\/\\])\]/g, "$1") : n7.replace(/((?!\\).|^)\[([^\/\\])\]/g, "$1$2").replace(/\\([^\/])/g, "$1") : t ? n7.replace(/\[([^\/\\{}])\]/g, "$1") : n7.replace(/((?!\\).|^)\[([^\/\\{}])\]/g, "$1$2").replace(/\\([^\/{}])/g, "$1");
var xs = /* @__PURE__ */ new Set(["!", "?", "+", "*", "@"]);
var be = (n7) => xs.has(n7);
var vs = "(?!(?:^|/)\\.\\.?(?:$|/))";
var Ct = "(?!\\.)";
var Cs = /* @__PURE__ */ new Set(["[", "."]);
var Ts = /* @__PURE__ */ new Set(["..", "."]);
var As = new Set("().*{}+?[]^$\\!");
var ks = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var Kt = "[^/]";
var Se = Kt + "*?";
var Ee = Kt + "+?";
var Q = class n {
  type;
  #t;
  #s;
  #n = false;
  #r = [];
  #o;
  #S;
  #w;
  #c = false;
  #h;
  #u;
  #f = false;
  constructor(t, e, s = {}) {
    this.type = t, t && (this.#s = true), this.#o = e, this.#t = this.#o ? this.#o.#t : this, this.#h = this.#t === this ? s : this.#t.#h, this.#w = this.#t === this ? [] : this.#t.#w, t === "!" && !this.#t.#c && this.#w.push(this), this.#S = this.#o ? this.#o.#r.length : 0;
  }
  get hasMagic() {
    if (this.#s !== void 0) return this.#s;
    for (let t of this.#r) if (typeof t != "string" && (t.type || t.hasMagic)) return this.#s = true;
    return this.#s;
  }
  toString() {
    return this.#u !== void 0 ? this.#u : this.type ? this.#u = this.type + "(" + this.#r.map((t) => String(t)).join("|") + ")" : this.#u = this.#r.map((t) => String(t)).join("");
  }
  #a() {
    if (this !== this.#t) throw new Error("should only call on root");
    if (this.#c) return this;
    this.toString(), this.#c = true;
    let t;
    for (; t = this.#w.pop(); ) {
      if (t.type !== "!") continue;
      let e = t, s = e.#o;
      for (; s; ) {
        for (let i = e.#S + 1; !s.type && i < s.#r.length; i++) for (let r of t.#r) {
          if (typeof r == "string") throw new Error("string part in extglob AST??");
          r.copyIn(s.#r[i]);
        }
        e = s, s = e.#o;
      }
    }
    return this;
  }
  push(...t) {
    for (let e of t) if (e !== "") {
      if (typeof e != "string" && !(e instanceof n && e.#o === this)) throw new Error("invalid part: " + e);
      this.#r.push(e);
    }
  }
  toJSON() {
    let t = this.type === null ? this.#r.slice().map((e) => typeof e == "string" ? e : e.toJSON()) : [this.type, ...this.#r.map((e) => e.toJSON())];
    return this.isStart() && !this.type && t.unshift([]), this.isEnd() && (this === this.#t || this.#t.#c && this.#o?.type === "!") && t.push({}), t;
  }
  isStart() {
    if (this.#t === this) return true;
    if (!this.#o?.isStart()) return false;
    if (this.#S === 0) return true;
    let t = this.#o;
    for (let e = 0; e < this.#S; e++) {
      let s = t.#r[e];
      if (!(s instanceof n && s.type === "!")) return false;
    }
    return true;
  }
  isEnd() {
    if (this.#t === this || this.#o?.type === "!") return true;
    if (!this.#o?.isEnd()) return false;
    if (!this.type) return this.#o?.isEnd();
    let t = this.#o ? this.#o.#r.length : 0;
    return this.#S === t - 1;
  }
  copyIn(t) {
    typeof t == "string" ? this.push(t) : this.push(t.clone(this));
  }
  clone(t) {
    let e = new n(this.type, t);
    for (let s of this.#r) e.copyIn(s);
    return e;
  }
  static #i(t, e, s, i) {
    let r = false, o = false, h = -1, a = false;
    if (e.type === null) {
      let f = s, m = "";
      for (; f < t.length; ) {
        let p = t.charAt(f++);
        if (r || p === "\\") {
          r = !r, m += p;
          continue;
        }
        if (o) {
          f === h + 1 ? (p === "^" || p === "!") && (a = true) : p === "]" && !(f === h + 2 && a) && (o = false), m += p;
          continue;
        } else if (p === "[") {
          o = true, h = f, a = false, m += p;
          continue;
        }
        if (!i.noext && be(p) && t.charAt(f) === "(") {
          e.push(m), m = "";
          let w = new n(p, e);
          f = n.#i(t, w, f, i), e.push(w);
          continue;
        }
        m += p;
      }
      return e.push(m), f;
    }
    let l = s + 1, u = new n(null, e), c = [], d = "";
    for (; l < t.length; ) {
      let f = t.charAt(l++);
      if (r || f === "\\") {
        r = !r, d += f;
        continue;
      }
      if (o) {
        l === h + 1 ? (f === "^" || f === "!") && (a = true) : f === "]" && !(l === h + 2 && a) && (o = false), d += f;
        continue;
      } else if (f === "[") {
        o = true, h = l, a = false, d += f;
        continue;
      }
      if (be(f) && t.charAt(l) === "(") {
        u.push(d), d = "";
        let m = new n(f, u);
        u.push(m), l = n.#i(t, m, l, i);
        continue;
      }
      if (f === "|") {
        u.push(d), d = "", c.push(u), u = new n(null, e);
        continue;
      }
      if (f === ")") return d === "" && e.#r.length === 0 && (e.#f = true), u.push(d), d = "", e.push(...c, u), l;
      d += f;
    }
    return e.type = null, e.#s = void 0, e.#r = [t.substring(s - 1)], l;
  }
  static fromGlob(t, e = {}) {
    let s = new n(null, void 0, e);
    return n.#i(t, s, 0, e), s;
  }
  toMMPattern() {
    if (this !== this.#t) return this.#t.toMMPattern();
    let t = this.toString(), [e, s, i, r] = this.toRegExpSource();
    if (!(i || this.#s || this.#h.nocase && !this.#h.nocaseMagicOnly && t.toUpperCase() !== t.toLowerCase())) return s;
    let h = (this.#h.nocase ? "i" : "") + (r ? "u" : "");
    return Object.assign(new RegExp(`^${e}$`, h), { _src: e, _glob: t });
  }
  get options() {
    return this.#h;
  }
  toRegExpSource(t) {
    let e = t ?? !!this.#h.dot;
    if (this.#t === this && this.#a(), !this.type) {
      let a = this.isStart() && this.isEnd() && !this.#r.some((f) => typeof f != "string"), l = this.#r.map((f) => {
        let [m, p, w, g] = typeof f == "string" ? n.#E(f, this.#s, a) : f.toRegExpSource(t);
        return this.#s = this.#s || w, this.#n = this.#n || g, m;
      }).join(""), u = "";
      if (this.isStart() && typeof this.#r[0] == "string" && !(this.#r.length === 1 && Ts.has(this.#r[0]))) {
        let m = Cs, p = e && m.has(l.charAt(0)) || l.startsWith("\\.") && m.has(l.charAt(2)) || l.startsWith("\\.\\.") && m.has(l.charAt(4)), w = !e && !t && m.has(l.charAt(0));
        u = p ? vs : w ? Ct : "";
      }
      let c = "";
      return this.isEnd() && this.#t.#c && this.#o?.type === "!" && (c = "(?:$|\\/)"), [u + l + c, W(l), this.#s = !!this.#s, this.#n];
    }
    let s = this.type === "*" || this.type === "+", i = this.type === "!" ? "(?:(?!(?:" : "(?:", r = this.#d(e);
    if (this.isStart() && this.isEnd() && !r && this.type !== "!") {
      let a = this.toString();
      return this.#r = [a], this.type = null, this.#s = void 0, [a, W(this.toString()), false, false];
    }
    let o = !s || t || e || !Ct ? "" : this.#d(true);
    o === r && (o = ""), o && (r = `(?:${r})(?:${o})*?`);
    let h = "";
    if (this.type === "!" && this.#f) h = (this.isStart() && !e ? Ct : "") + Ee;
    else {
      let a = this.type === "!" ? "))" + (this.isStart() && !e && !t ? Ct : "") + Se + ")" : this.type === "@" ? ")" : this.type === "?" ? ")?" : this.type === "+" && o ? ")" : this.type === "*" && o ? ")?" : `)${this.type}`;
      h = i + r + a;
    }
    return [h, W(r), this.#s = !!this.#s, this.#n];
  }
  #d(t) {
    return this.#r.map((e) => {
      if (typeof e == "string") throw new Error("string type in extglob ast??");
      let [s, i, r, o] = e.toRegExpSource(t);
      return this.#n = this.#n || o, s;
    }).filter((e) => !(this.isStart() && this.isEnd()) || !!e).join("|");
  }
  static #E(t, e, s = false) {
    let i = false, r = "", o = false, h = false;
    for (let a = 0; a < t.length; a++) {
      let l = t.charAt(a);
      if (i) {
        i = false, r += (As.has(l) ? "\\" : "") + l;
        continue;
      }
      if (l === "*") {
        if (h) continue;
        h = true, r += s && /^[*]+$/.test(t) ? Ee : Se, e = true;
        continue;
      } else h = false;
      if (l === "\\") {
        a === t.length - 1 ? r += "\\\\" : i = true;
        continue;
      }
      if (l === "[") {
        let [u, c, d, f] = ye(t, a);
        if (d) {
          r += u, o = o || c, a += d - 1, e = e || f;
          continue;
        }
      }
      if (l === "?") {
        r += Kt, e = true;
        continue;
      }
      r += ks(l);
    }
    return [r, W(t), !!e, o];
  }
};
var tt = (n7, { windowsPathsNoEscape: t = false, magicalBraces: e = false } = {}) => e ? t ? n7.replace(/[?*()[\]{}]/g, "[$&]") : n7.replace(/[?*()[\]\\{}]/g, "\\$&") : t ? n7.replace(/[?*()[\]]/g, "[$&]") : n7.replace(/[?*()[\]\\]/g, "\\$&");
var O = (n7, t, e = {}) => (at(t), !e.nocomment && t.charAt(0) === "#" ? false : new D(t, e).match(n7));
var Rs = /^\*+([^+@!?\*\[\(]*)$/;
var Os = (n7) => (t) => !t.startsWith(".") && t.endsWith(n7);
var Fs = (n7) => (t) => t.endsWith(n7);
var Ds = (n7) => (n7 = n7.toLowerCase(), (t) => !t.startsWith(".") && t.toLowerCase().endsWith(n7));
var Ms = (n7) => (n7 = n7.toLowerCase(), (t) => t.toLowerCase().endsWith(n7));
var Ns = /^\*+\.\*+$/;
var _s = (n7) => !n7.startsWith(".") && n7.includes(".");
var Ls = (n7) => n7 !== "." && n7 !== ".." && n7.includes(".");
var Ws = /^\.\*+$/;
var Ps = (n7) => n7 !== "." && n7 !== ".." && n7.startsWith(".");
var js = /^\*+$/;
var Is = (n7) => n7.length !== 0 && !n7.startsWith(".");
var zs = (n7) => n7.length !== 0 && n7 !== "." && n7 !== "..";
var Bs = /^\?+([^+@!?\*\[\(]*)?$/;
var Us = ([n7, t = ""]) => {
  let e = Ce([n7]);
  return t ? (t = t.toLowerCase(), (s) => e(s) && s.toLowerCase().endsWith(t)) : e;
};
var $s = ([n7, t = ""]) => {
  let e = Te([n7]);
  return t ? (t = t.toLowerCase(), (s) => e(s) && s.toLowerCase().endsWith(t)) : e;
};
var Gs = ([n7, t = ""]) => {
  let e = Te([n7]);
  return t ? (s) => e(s) && s.endsWith(t) : e;
};
var Hs = ([n7, t = ""]) => {
  let e = Ce([n7]);
  return t ? (s) => e(s) && s.endsWith(t) : e;
};
var Ce = ([n7]) => {
  let t = n7.length;
  return (e) => e.length === t && !e.startsWith(".");
};
var Te = ([n7]) => {
  let t = n7.length;
  return (e) => e.length === t && e !== "." && e !== "..";
};
var Ae = typeof process == "object" && process ? typeof process.env == "object" && process.env && process.env.__MINIMATCH_TESTING_PLATFORM__ || process.platform : "posix";
var xe = { win32: { sep: "\\" }, posix: { sep: "/" } };
var qs = Ae === "win32" ? xe.win32.sep : xe.posix.sep;
O.sep = qs;
var A = /* @__PURE__ */ Symbol("globstar **");
O.GLOBSTAR = A;
var Ks = "[^/]";
var Vs = Ks + "*?";
var Ys = "(?:(?!(?:\\/|^)(?:\\.{1,2})($|\\/)).)*?";
var Xs = "(?:(?!(?:\\/|^)\\.).)*?";
var Js = (n7, t = {}) => (e) => O(e, n7, t);
O.filter = Js;
var N = (n7, t = {}) => Object.assign({}, n7, t);
var Zs = (n7) => {
  if (!n7 || typeof n7 != "object" || !Object.keys(n7).length) return O;
  let t = O;
  return Object.assign((s, i, r = {}) => t(s, i, N(n7, r)), { Minimatch: class extends t.Minimatch {
    constructor(i, r = {}) {
      super(i, N(n7, r));
    }
    static defaults(i) {
      return t.defaults(N(n7, i)).Minimatch;
    }
  }, AST: class extends t.AST {
    constructor(i, r, o = {}) {
      super(i, r, N(n7, o));
    }
    static fromGlob(i, r = {}) {
      return t.AST.fromGlob(i, N(n7, r));
    }
  }, unescape: (s, i = {}) => t.unescape(s, N(n7, i)), escape: (s, i = {}) => t.escape(s, N(n7, i)), filter: (s, i = {}) => t.filter(s, N(n7, i)), defaults: (s) => t.defaults(N(n7, s)), makeRe: (s, i = {}) => t.makeRe(s, N(n7, i)), braceExpand: (s, i = {}) => t.braceExpand(s, N(n7, i)), match: (s, i, r = {}) => t.match(s, i, N(n7, r)), sep: t.sep, GLOBSTAR: A });
};
O.defaults = Zs;
var ke = (n7, t = {}) => (at(n7), t.nobrace || !/\{(?:(?!\{).)*\}/.test(n7) ? [n7] : ge(n7, { max: t.braceExpandMax }));
O.braceExpand = ke;
var Qs = (n7, t = {}) => new D(n7, t).makeRe();
O.makeRe = Qs;
var ti = (n7, t, e = {}) => {
  let s = new D(t, e);
  return n7 = n7.filter((i) => s.match(i)), s.options.nonull && !n7.length && n7.push(t), n7;
};
O.match = ti;
var ve = /[?*]|[+@!]\(.*?\)|\[|\]/;
var ei = (n7) => n7.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
var D = class {
  options;
  set;
  pattern;
  windowsPathsNoEscape;
  nonegate;
  negate;
  comment;
  empty;
  preserveMultipleSlashes;
  partial;
  globSet;
  globParts;
  nocase;
  isWindows;
  platform;
  windowsNoMagicRoot;
  regexp;
  constructor(t, e = {}) {
    at(t), e = e || {}, this.options = e, this.pattern = t, this.platform = e.platform || Ae, this.isWindows = this.platform === "win32";
    let s = "allowWindowsEscape";
    this.windowsPathsNoEscape = !!e.windowsPathsNoEscape || e[s] === false, this.windowsPathsNoEscape && (this.pattern = this.pattern.replace(/\\/g, "/")), this.preserveMultipleSlashes = !!e.preserveMultipleSlashes, this.regexp = null, this.negate = false, this.nonegate = !!e.nonegate, this.comment = false, this.empty = false, this.partial = !!e.partial, this.nocase = !!this.options.nocase, this.windowsNoMagicRoot = e.windowsNoMagicRoot !== void 0 ? e.windowsNoMagicRoot : !!(this.isWindows && this.nocase), this.globSet = [], this.globParts = [], this.set = [], this.make();
  }
  hasMagic() {
    if (this.options.magicalBraces && this.set.length > 1) return true;
    for (let t of this.set) for (let e of t) if (typeof e != "string") return true;
    return false;
  }
  debug(...t) {
  }
  make() {
    let t = this.pattern, e = this.options;
    if (!e.nocomment && t.charAt(0) === "#") {
      this.comment = true;
      return;
    }
    if (!t) {
      this.empty = true;
      return;
    }
    this.parseNegate(), this.globSet = [...new Set(this.braceExpand())], e.debug && (this.debug = (...r) => console.error(...r)), this.debug(this.pattern, this.globSet);
    let s = this.globSet.map((r) => this.slashSplit(r));
    this.globParts = this.preprocess(s), this.debug(this.pattern, this.globParts);
    let i = this.globParts.map((r, o, h) => {
      if (this.isWindows && this.windowsNoMagicRoot) {
        let a = r[0] === "" && r[1] === "" && (r[2] === "?" || !ve.test(r[2])) && !ve.test(r[3]), l = /^[a-z]:/i.test(r[0]);
        if (a) return [...r.slice(0, 4), ...r.slice(4).map((u) => this.parse(u))];
        if (l) return [r[0], ...r.slice(1).map((u) => this.parse(u))];
      }
      return r.map((a) => this.parse(a));
    });
    if (this.debug(this.pattern, i), this.set = i.filter((r) => r.indexOf(false) === -1), this.isWindows) for (let r = 0; r < this.set.length; r++) {
      let o = this.set[r];
      o[0] === "" && o[1] === "" && this.globParts[r][2] === "?" && typeof o[3] == "string" && /^[a-z]:$/i.test(o[3]) && (o[2] = "?");
    }
    this.debug(this.pattern, this.set);
  }
  preprocess(t) {
    if (this.options.noglobstar) for (let s = 0; s < t.length; s++) for (let i = 0; i < t[s].length; i++) t[s][i] === "**" && (t[s][i] = "*");
    let { optimizationLevel: e = 1 } = this.options;
    return e >= 2 ? (t = this.firstPhasePreProcess(t), t = this.secondPhasePreProcess(t)) : e >= 1 ? t = this.levelOneOptimize(t) : t = this.adjascentGlobstarOptimize(t), t;
  }
  adjascentGlobstarOptimize(t) {
    return t.map((e) => {
      let s = -1;
      for (; (s = e.indexOf("**", s + 1)) !== -1; ) {
        let i = s;
        for (; e[i + 1] === "**"; ) i++;
        i !== s && e.splice(s, i - s);
      }
      return e;
    });
  }
  levelOneOptimize(t) {
    return t.map((e) => (e = e.reduce((s, i) => {
      let r = s[s.length - 1];
      return i === "**" && r === "**" ? s : i === ".." && r && r !== ".." && r !== "." && r !== "**" ? (s.pop(), s) : (s.push(i), s);
    }, []), e.length === 0 ? [""] : e));
  }
  levelTwoFileOptimize(t) {
    Array.isArray(t) || (t = this.slashSplit(t));
    let e = false;
    do {
      if (e = false, !this.preserveMultipleSlashes) {
        for (let i = 1; i < t.length - 1; i++) {
          let r = t[i];
          i === 1 && r === "" && t[0] === "" || (r === "." || r === "") && (e = true, t.splice(i, 1), i--);
        }
        t[0] === "." && t.length === 2 && (t[1] === "." || t[1] === "") && (e = true, t.pop());
      }
      let s = 0;
      for (; (s = t.indexOf("..", s + 1)) !== -1; ) {
        let i = t[s - 1];
        i && i !== "." && i !== ".." && i !== "**" && (e = true, t.splice(s - 1, 2), s -= 2);
      }
    } while (e);
    return t.length === 0 ? [""] : t;
  }
  firstPhasePreProcess(t) {
    let e = false;
    do {
      e = false;
      for (let s of t) {
        let i = -1;
        for (; (i = s.indexOf("**", i + 1)) !== -1; ) {
          let o = i;
          for (; s[o + 1] === "**"; ) o++;
          o > i && s.splice(i + 1, o - i);
          let h = s[i + 1], a = s[i + 2], l = s[i + 3];
          if (h !== ".." || !a || a === "." || a === ".." || !l || l === "." || l === "..") continue;
          e = true, s.splice(i, 1);
          let u = s.slice(0);
          u[i] = "**", t.push(u), i--;
        }
        if (!this.preserveMultipleSlashes) {
          for (let o = 1; o < s.length - 1; o++) {
            let h = s[o];
            o === 1 && h === "" && s[0] === "" || (h === "." || h === "") && (e = true, s.splice(o, 1), o--);
          }
          s[0] === "." && s.length === 2 && (s[1] === "." || s[1] === "") && (e = true, s.pop());
        }
        let r = 0;
        for (; (r = s.indexOf("..", r + 1)) !== -1; ) {
          let o = s[r - 1];
          if (o && o !== "." && o !== ".." && o !== "**") {
            e = true;
            let a = r === 1 && s[r + 1] === "**" ? ["."] : [];
            s.splice(r - 1, 2, ...a), s.length === 0 && s.push(""), r -= 2;
          }
        }
      }
    } while (e);
    return t;
  }
  secondPhasePreProcess(t) {
    for (let e = 0; e < t.length - 1; e++) for (let s = e + 1; s < t.length; s++) {
      let i = this.partsMatch(t[e], t[s], !this.preserveMultipleSlashes);
      if (i) {
        t[e] = [], t[s] = i;
        break;
      }
    }
    return t.filter((e) => e.length);
  }
  partsMatch(t, e, s = false) {
    let i = 0, r = 0, o = [], h = "";
    for (; i < t.length && r < e.length; ) if (t[i] === e[r]) o.push(h === "b" ? e[r] : t[i]), i++, r++;
    else if (s && t[i] === "**" && e[r] === t[i + 1]) o.push(t[i]), i++;
    else if (s && e[r] === "**" && t[i] === e[r + 1]) o.push(e[r]), r++;
    else if (t[i] === "*" && e[r] && (this.options.dot || !e[r].startsWith(".")) && e[r] !== "**") {
      if (h === "b") return false;
      h = "a", o.push(t[i]), i++, r++;
    } else if (e[r] === "*" && t[i] && (this.options.dot || !t[i].startsWith(".")) && t[i] !== "**") {
      if (h === "a") return false;
      h = "b", o.push(e[r]), i++, r++;
    } else return false;
    return t.length === e.length && o;
  }
  parseNegate() {
    if (this.nonegate) return;
    let t = this.pattern, e = false, s = 0;
    for (let i = 0; i < t.length && t.charAt(i) === "!"; i++) e = !e, s++;
    s && (this.pattern = t.slice(s)), this.negate = e;
  }
  matchOne(t, e, s = false) {
    let i = this.options;
    if (this.isWindows) {
      let p = typeof t[0] == "string" && /^[a-z]:$/i.test(t[0]), w = !p && t[0] === "" && t[1] === "" && t[2] === "?" && /^[a-z]:$/i.test(t[3]), g = typeof e[0] == "string" && /^[a-z]:$/i.test(e[0]), S = !g && e[0] === "" && e[1] === "" && e[2] === "?" && typeof e[3] == "string" && /^[a-z]:$/i.test(e[3]), E = w ? 3 : p ? 0 : void 0, y = S ? 3 : g ? 0 : void 0;
      if (typeof E == "number" && typeof y == "number") {
        let [b, z] = [t[E], e[y]];
        b.toLowerCase() === z.toLowerCase() && (e[y] = b, y > E ? e = e.slice(y) : E > y && (t = t.slice(E)));
      }
    }
    let { optimizationLevel: r = 1 } = this.options;
    r >= 2 && (t = this.levelTwoFileOptimize(t)), this.debug("matchOne", this, { file: t, pattern: e }), this.debug("matchOne", t.length, e.length);
    for (var o = 0, h = 0, a = t.length, l = e.length; o < a && h < l; o++, h++) {
      this.debug("matchOne loop");
      var u = e[h], c = t[o];
      if (this.debug(e, u, c), u === false) return false;
      if (u === A) {
        this.debug("GLOBSTAR", [e, u, c]);
        var d = o, f = h + 1;
        if (f === l) {
          for (this.debug("** at the end"); o < a; o++) if (t[o] === "." || t[o] === ".." || !i.dot && t[o].charAt(0) === ".") return false;
          return true;
        }
        for (; d < a; ) {
          var m = t[d];
          if (this.debug(`
globstar while`, t, d, e, f, m), this.matchOne(t.slice(d), e.slice(f), s)) return this.debug("globstar found match!", d, a, m), true;
          if (m === "." || m === ".." || !i.dot && m.charAt(0) === ".") {
            this.debug("dot detected!", t, d, e, f);
            break;
          }
          this.debug("globstar swallow a segment, and continue"), d++;
        }
        return !!(s && (this.debug(`
>>> no match, partial?`, t, d, e, f), d === a));
      }
      let p;
      if (typeof u == "string" ? (p = c === u, this.debug("string match", u, c, p)) : (p = u.test(c), this.debug("pattern match", u, c, p)), !p) return false;
    }
    if (o === a && h === l) return true;
    if (o === a) return s;
    if (h === l) return o === a - 1 && t[o] === "";
    throw new Error("wtf?");
  }
  braceExpand() {
    return ke(this.pattern, this.options);
  }
  parse(t) {
    at(t);
    let e = this.options;
    if (t === "**") return A;
    if (t === "") return "";
    let s, i = null;
    (s = t.match(js)) ? i = e.dot ? zs : Is : (s = t.match(Rs)) ? i = (e.nocase ? e.dot ? Ms : Ds : e.dot ? Fs : Os)(s[1]) : (s = t.match(Bs)) ? i = (e.nocase ? e.dot ? $s : Us : e.dot ? Gs : Hs)(s) : (s = t.match(Ns)) ? i = e.dot ? Ls : _s : (s = t.match(Ws)) && (i = Ps);
    let r = Q.fromGlob(t, this.options).toMMPattern();
    return i && typeof r == "object" && Reflect.defineProperty(r, "test", { value: i }), r;
  }
  makeRe() {
    if (this.regexp || this.regexp === false) return this.regexp;
    let t = this.set;
    if (!t.length) return this.regexp = false, this.regexp;
    let e = this.options, s = e.noglobstar ? Vs : e.dot ? Ys : Xs, i = new Set(e.nocase ? ["i"] : []), r = t.map((a) => {
      let l = a.map((c) => {
        if (c instanceof RegExp) for (let d of c.flags.split("")) i.add(d);
        return typeof c == "string" ? ei(c) : c === A ? A : c._src;
      });
      l.forEach((c, d) => {
        let f = l[d + 1], m = l[d - 1];
        c !== A || m === A || (m === void 0 ? f !== void 0 && f !== A ? l[d + 1] = "(?:\\/|" + s + "\\/)?" + f : l[d] = s : f === void 0 ? l[d - 1] = m + "(?:\\/|\\/" + s + ")?" : f !== A && (l[d - 1] = m + "(?:\\/|\\/" + s + "\\/)" + f, l[d + 1] = A));
      });
      let u = l.filter((c) => c !== A);
      if (this.partial && u.length >= 1) {
        let c = [];
        for (let d = 1; d <= u.length; d++) c.push(u.slice(0, d).join("/"));
        return "(?:" + c.join("|") + ")";
      }
      return u.join("/");
    }).join("|"), [o, h] = t.length > 1 ? ["(?:", ")"] : ["", ""];
    r = "^" + o + r + h + "$", this.partial && (r = "^(?:\\/|" + o + r.slice(1, -1) + h + ")$"), this.negate && (r = "^(?!" + r + ").+$");
    try {
      this.regexp = new RegExp(r, [...i].join(""));
    } catch {
      this.regexp = false;
    }
    return this.regexp;
  }
  slashSplit(t) {
    return this.preserveMultipleSlashes ? t.split("/") : this.isWindows && /^\/\/[^\/]+/.test(t) ? ["", ...t.split(/\/+/)] : t.split(/\/+/);
  }
  match(t, e = this.partial) {
    if (this.debug("match", t, this.pattern), this.comment) return false;
    if (this.empty) return t === "";
    if (t === "/" && e) return true;
    let s = this.options;
    this.isWindows && (t = t.split("\\").join("/"));
    let i = this.slashSplit(t);
    this.debug(this.pattern, "split", i);
    let r = this.set;
    this.debug(this.pattern, "set", r);
    let o = i[i.length - 1];
    if (!o) for (let h = i.length - 2; !o && h >= 0; h--) o = i[h];
    for (let h = 0; h < r.length; h++) {
      let a = r[h], l = i;
      if (s.matchBase && a.length === 1 && (l = [o]), this.matchOne(l, a, e)) return s.flipNegate ? true : !this.negate;
    }
    return s.flipNegate ? false : this.negate;
  }
  static defaults(t) {
    return O.defaults(t).Minimatch;
  }
};
O.AST = Q;
O.Minimatch = D;
O.escape = tt;
O.unescape = W;
var si = typeof performance == "object" && performance && typeof performance.now == "function" ? performance : Date;
var Oe = /* @__PURE__ */ new Set();
var Vt = typeof process == "object" && process ? process : {};
var Fe = (n7, t, e, s) => {
  typeof Vt.emitWarning == "function" ? Vt.emitWarning(n7, t, e, s) : console.error(`[${e}] ${t}: ${n7}`);
};
var At = globalThis.AbortController;
var Re = globalThis.AbortSignal;
if (typeof At > "u") {
  Re = class {
    onabort;
    _onabort = [];
    reason;
    aborted = false;
    addEventListener(e, s) {
      this._onabort.push(s);
    }
  }, At = class {
    constructor() {
      t();
    }
    signal = new Re();
    abort(e) {
      if (!this.signal.aborted) {
        this.signal.reason = e, this.signal.aborted = true;
        for (let s of this.signal._onabort) s(e);
        this.signal.onabort?.(e);
      }
    }
  };
  let n7 = Vt.env?.LRU_CACHE_IGNORE_AC_WARNING !== "1", t = () => {
    n7 && (n7 = false, Fe("AbortController is not defined. If using lru-cache in node 14, load an AbortController polyfill from the `node-abort-controller` package. A minimal polyfill is provided for use by LRUCache.fetch(), but it should not be relied upon in other contexts (eg, passing it to other APIs that use AbortController/AbortSignal might have undesirable effects). You may disable this with LRU_CACHE_IGNORE_AC_WARNING=1 in the env.", "NO_ABORT_CONTROLLER", "ENOTSUP", t));
  };
}
var ii = (n7) => !Oe.has(n7);
var q = (n7) => n7 && n7 === Math.floor(n7) && n7 > 0 && isFinite(n7);
var De = (n7) => q(n7) ? n7 <= Math.pow(2, 8) ? Uint8Array : n7 <= Math.pow(2, 16) ? Uint16Array : n7 <= Math.pow(2, 32) ? Uint32Array : n7 <= Number.MAX_SAFE_INTEGER ? Tt : null : null;
var Tt = class extends Array {
  constructor(n7) {
    super(n7), this.fill(0);
  }
};
var ri = class ct {
  heap;
  length;
  static #t = false;
  static create(t) {
    let e = De(t);
    if (!e) return [];
    ct.#t = true;
    let s = new ct(t, e);
    return ct.#t = false, s;
  }
  constructor(t, e) {
    if (!ct.#t) throw new TypeError("instantiate Stack using Stack.create(n)");
    this.heap = new e(t), this.length = 0;
  }
  push(t) {
    this.heap[this.length++] = t;
  }
  pop() {
    return this.heap[--this.length];
  }
};
var ft = class Me {
  #t;
  #s;
  #n;
  #r;
  #o;
  #S;
  #w;
  #c;
  get perf() {
    return this.#c;
  }
  ttl;
  ttlResolution;
  ttlAutopurge;
  updateAgeOnGet;
  updateAgeOnHas;
  allowStale;
  noDisposeOnSet;
  noUpdateTTL;
  maxEntrySize;
  sizeCalculation;
  noDeleteOnFetchRejection;
  noDeleteOnStaleGet;
  allowStaleOnFetchAbort;
  allowStaleOnFetchRejection;
  ignoreFetchAbort;
  #h;
  #u;
  #f;
  #a;
  #i;
  #d;
  #E;
  #b;
  #p;
  #R;
  #m;
  #C;
  #T;
  #g;
  #y;
  #x;
  #A;
  #e;
  #_;
  static unsafeExposeInternals(t) {
    return { starts: t.#T, ttls: t.#g, autopurgeTimers: t.#y, sizes: t.#C, keyMap: t.#f, keyList: t.#a, valList: t.#i, next: t.#d, prev: t.#E, get head() {
      return t.#b;
    }, get tail() {
      return t.#p;
    }, free: t.#R, isBackgroundFetch: (e) => t.#l(e), backgroundFetch: (e, s, i, r) => t.#U(e, s, i, r), moveToTail: (e) => t.#W(e), indexes: (e) => t.#F(e), rindexes: (e) => t.#D(e), isStale: (e) => t.#v(e) };
  }
  get max() {
    return this.#t;
  }
  get maxSize() {
    return this.#s;
  }
  get calculatedSize() {
    return this.#u;
  }
  get size() {
    return this.#h;
  }
  get fetchMethod() {
    return this.#S;
  }
  get memoMethod() {
    return this.#w;
  }
  get dispose() {
    return this.#n;
  }
  get onInsert() {
    return this.#r;
  }
  get disposeAfter() {
    return this.#o;
  }
  constructor(t) {
    let { max: e = 0, ttl: s, ttlResolution: i = 1, ttlAutopurge: r, updateAgeOnGet: o, updateAgeOnHas: h, allowStale: a, dispose: l, onInsert: u, disposeAfter: c, noDisposeOnSet: d, noUpdateTTL: f, maxSize: m = 0, maxEntrySize: p = 0, sizeCalculation: w, fetchMethod: g, memoMethod: S, noDeleteOnFetchRejection: E, noDeleteOnStaleGet: y, allowStaleOnFetchRejection: b, allowStaleOnFetchAbort: z, ignoreFetchAbort: $, perf: J } = t;
    if (J !== void 0 && typeof J?.now != "function") throw new TypeError("perf option must have a now() method if specified");
    if (this.#c = J ?? si, e !== 0 && !q(e)) throw new TypeError("max option must be a nonnegative integer");
    let Z = e ? De(e) : Array;
    if (!Z) throw new Error("invalid max value: " + e);
    if (this.#t = e, this.#s = m, this.maxEntrySize = p || this.#s, this.sizeCalculation = w, this.sizeCalculation) {
      if (!this.#s && !this.maxEntrySize) throw new TypeError("cannot set sizeCalculation without setting maxSize or maxEntrySize");
      if (typeof this.sizeCalculation != "function") throw new TypeError("sizeCalculation set to non-function");
    }
    if (S !== void 0 && typeof S != "function") throw new TypeError("memoMethod must be a function if defined");
    if (this.#w = S, g !== void 0 && typeof g != "function") throw new TypeError("fetchMethod must be a function if specified");
    if (this.#S = g, this.#A = !!g, this.#f = /* @__PURE__ */ new Map(), this.#a = new Array(e).fill(void 0), this.#i = new Array(e).fill(void 0), this.#d = new Z(e), this.#E = new Z(e), this.#b = 0, this.#p = 0, this.#R = ri.create(e), this.#h = 0, this.#u = 0, typeof l == "function" && (this.#n = l), typeof u == "function" && (this.#r = u), typeof c == "function" ? (this.#o = c, this.#m = []) : (this.#o = void 0, this.#m = void 0), this.#x = !!this.#n, this.#_ = !!this.#r, this.#e = !!this.#o, this.noDisposeOnSet = !!d, this.noUpdateTTL = !!f, this.noDeleteOnFetchRejection = !!E, this.allowStaleOnFetchRejection = !!b, this.allowStaleOnFetchAbort = !!z, this.ignoreFetchAbort = !!$, this.maxEntrySize !== 0) {
      if (this.#s !== 0 && !q(this.#s)) throw new TypeError("maxSize must be a positive integer if specified");
      if (!q(this.maxEntrySize)) throw new TypeError("maxEntrySize must be a positive integer if specified");
      this.#G();
    }
    if (this.allowStale = !!a, this.noDeleteOnStaleGet = !!y, this.updateAgeOnGet = !!o, this.updateAgeOnHas = !!h, this.ttlResolution = q(i) || i === 0 ? i : 1, this.ttlAutopurge = !!r, this.ttl = s || 0, this.ttl) {
      if (!q(this.ttl)) throw new TypeError("ttl must be a positive integer if specified");
      this.#M();
    }
    if (this.#t === 0 && this.ttl === 0 && this.#s === 0) throw new TypeError("At least one of max, maxSize, or ttl is required");
    if (!this.ttlAutopurge && !this.#t && !this.#s) {
      let $t = "LRU_CACHE_UNBOUNDED";
      ii($t) && (Oe.add($t), Fe("TTL caching without ttlAutopurge, max, or maxSize can result in unbounded memory consumption.", "UnboundedCacheWarning", $t, Me));
    }
  }
  getRemainingTTL(t) {
    return this.#f.has(t) ? 1 / 0 : 0;
  }
  #M() {
    let t = new Tt(this.#t), e = new Tt(this.#t);
    this.#g = t, this.#T = e;
    let s = this.ttlAutopurge ? new Array(this.#t) : void 0;
    this.#y = s, this.#j = (o, h, a = this.#c.now()) => {
      if (e[o] = h !== 0 ? a : 0, t[o] = h, s?.[o] && (clearTimeout(s[o]), s[o] = void 0), h !== 0 && s) {
        let l = setTimeout(() => {
          this.#v(o) && this.#O(this.#a[o], "expire");
        }, h + 1);
        l.unref && l.unref(), s[o] = l;
      }
    }, this.#k = (o) => {
      e[o] = t[o] !== 0 ? this.#c.now() : 0;
    }, this.#N = (o, h) => {
      if (t[h]) {
        let a = t[h], l = e[h];
        if (!a || !l) return;
        o.ttl = a, o.start = l, o.now = i || r();
        let u = o.now - l;
        o.remainingTTL = a - u;
      }
    };
    let i = 0, r = () => {
      let o = this.#c.now();
      if (this.ttlResolution > 0) {
        i = o;
        let h = setTimeout(() => i = 0, this.ttlResolution);
        h.unref && h.unref();
      }
      return o;
    };
    this.getRemainingTTL = (o) => {
      let h = this.#f.get(o);
      if (h === void 0) return 0;
      let a = t[h], l = e[h];
      if (!a || !l) return 1 / 0;
      let u = (i || r()) - l;
      return a - u;
    }, this.#v = (o) => {
      let h = e[o], a = t[o];
      return !!a && !!h && (i || r()) - h > a;
    };
  }
  #k = () => {
  };
  #N = () => {
  };
  #j = () => {
  };
  #v = () => false;
  #G() {
    let t = new Tt(this.#t);
    this.#u = 0, this.#C = t, this.#P = (e) => {
      this.#u -= t[e], t[e] = 0;
    }, this.#I = (e, s, i, r) => {
      if (this.#l(s)) return 0;
      if (!q(i)) if (r) {
        if (typeof r != "function") throw new TypeError("sizeCalculation must be a function");
        if (i = r(s, e), !q(i)) throw new TypeError("sizeCalculation return invalid (expect positive integer)");
      } else throw new TypeError("invalid size value (must be positive integer). When maxSize or maxEntrySize is used, sizeCalculation or size must be set.");
      return i;
    }, this.#L = (e, s, i) => {
      if (t[e] = s, this.#s) {
        let r = this.#s - t[e];
        for (; this.#u > r; ) this.#B(true);
      }
      this.#u += t[e], i && (i.entrySize = s, i.totalCalculatedSize = this.#u);
    };
  }
  #P = (t) => {
  };
  #L = (t, e, s) => {
  };
  #I = (t, e, s, i) => {
    if (s || i) throw new TypeError("cannot set size without setting maxSize or maxEntrySize on cache");
    return 0;
  };
  *#F({ allowStale: t = this.allowStale } = {}) {
    if (this.#h) for (let e = this.#p; !(!this.#z(e) || ((t || !this.#v(e)) && (yield e), e === this.#b)); ) e = this.#E[e];
  }
  *#D({ allowStale: t = this.allowStale } = {}) {
    if (this.#h) for (let e = this.#b; !(!this.#z(e) || ((t || !this.#v(e)) && (yield e), e === this.#p)); ) e = this.#d[e];
  }
  #z(t) {
    return t !== void 0 && this.#f.get(this.#a[t]) === t;
  }
  *entries() {
    for (let t of this.#F()) this.#i[t] !== void 0 && this.#a[t] !== void 0 && !this.#l(this.#i[t]) && (yield [this.#a[t], this.#i[t]]);
  }
  *rentries() {
    for (let t of this.#D()) this.#i[t] !== void 0 && this.#a[t] !== void 0 && !this.#l(this.#i[t]) && (yield [this.#a[t], this.#i[t]]);
  }
  *keys() {
    for (let t of this.#F()) {
      let e = this.#a[t];
      e !== void 0 && !this.#l(this.#i[t]) && (yield e);
    }
  }
  *rkeys() {
    for (let t of this.#D()) {
      let e = this.#a[t];
      e !== void 0 && !this.#l(this.#i[t]) && (yield e);
    }
  }
  *values() {
    for (let t of this.#F()) this.#i[t] !== void 0 && !this.#l(this.#i[t]) && (yield this.#i[t]);
  }
  *rvalues() {
    for (let t of this.#D()) this.#i[t] !== void 0 && !this.#l(this.#i[t]) && (yield this.#i[t]);
  }
  [Symbol.iterator]() {
    return this.entries();
  }
  [Symbol.toStringTag] = "LRUCache";
  find(t, e = {}) {
    for (let s of this.#F()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      if (r !== void 0 && t(r, this.#a[s], this)) return this.get(this.#a[s], e);
    }
  }
  forEach(t, e = this) {
    for (let s of this.#F()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      r !== void 0 && t.call(e, r, this.#a[s], this);
    }
  }
  rforEach(t, e = this) {
    for (let s of this.#D()) {
      let i = this.#i[s], r = this.#l(i) ? i.__staleWhileFetching : i;
      r !== void 0 && t.call(e, r, this.#a[s], this);
    }
  }
  purgeStale() {
    let t = false;
    for (let e of this.#D({ allowStale: true })) this.#v(e) && (this.#O(this.#a[e], "expire"), t = true);
    return t;
  }
  info(t) {
    let e = this.#f.get(t);
    if (e === void 0) return;
    let s = this.#i[e], i = this.#l(s) ? s.__staleWhileFetching : s;
    if (i === void 0) return;
    let r = { value: i };
    if (this.#g && this.#T) {
      let o = this.#g[e], h = this.#T[e];
      if (o && h) {
        let a = o - (this.#c.now() - h);
        r.ttl = a, r.start = Date.now();
      }
    }
    return this.#C && (r.size = this.#C[e]), r;
  }
  dump() {
    let t = [];
    for (let e of this.#F({ allowStale: true })) {
      let s = this.#a[e], i = this.#i[e], r = this.#l(i) ? i.__staleWhileFetching : i;
      if (r === void 0 || s === void 0) continue;
      let o = { value: r };
      if (this.#g && this.#T) {
        o.ttl = this.#g[e];
        let h = this.#c.now() - this.#T[e];
        o.start = Math.floor(Date.now() - h);
      }
      this.#C && (o.size = this.#C[e]), t.unshift([s, o]);
    }
    return t;
  }
  load(t) {
    this.clear();
    for (let [e, s] of t) {
      if (s.start) {
        let i = Date.now() - s.start;
        s.start = this.#c.now() - i;
      }
      this.set(e, s.value, s);
    }
  }
  set(t, e, s = {}) {
    if (e === void 0) return this.delete(t), this;
    let { ttl: i = this.ttl, start: r, noDisposeOnSet: o = this.noDisposeOnSet, sizeCalculation: h = this.sizeCalculation, status: a } = s, { noUpdateTTL: l = this.noUpdateTTL } = s, u = this.#I(t, e, s.size || 0, h);
    if (this.maxEntrySize && u > this.maxEntrySize) return a && (a.set = "miss", a.maxEntrySizeExceeded = true), this.#O(t, "set"), this;
    let c = this.#h === 0 ? void 0 : this.#f.get(t);
    if (c === void 0) c = this.#h === 0 ? this.#p : this.#R.length !== 0 ? this.#R.pop() : this.#h === this.#t ? this.#B(false) : this.#h, this.#a[c] = t, this.#i[c] = e, this.#f.set(t, c), this.#d[this.#p] = c, this.#E[c] = this.#p, this.#p = c, this.#h++, this.#L(c, u, a), a && (a.set = "add"), l = false, this.#_ && this.#r?.(e, t, "add");
    else {
      this.#W(c);
      let d = this.#i[c];
      if (e !== d) {
        if (this.#A && this.#l(d)) {
          d.__abortController.abort(new Error("replaced"));
          let { __staleWhileFetching: f } = d;
          f !== void 0 && !o && (this.#x && this.#n?.(f, t, "set"), this.#e && this.#m?.push([f, t, "set"]));
        } else o || (this.#x && this.#n?.(d, t, "set"), this.#e && this.#m?.push([d, t, "set"]));
        if (this.#P(c), this.#L(c, u, a), this.#i[c] = e, a) {
          a.set = "replace";
          let f = d && this.#l(d) ? d.__staleWhileFetching : d;
          f !== void 0 && (a.oldValue = f);
        }
      } else a && (a.set = "update");
      this.#_ && this.onInsert?.(e, t, e === d ? "update" : "replace");
    }
    if (i !== 0 && !this.#g && this.#M(), this.#g && (l || this.#j(c, i, r), a && this.#N(a, c)), !o && this.#e && this.#m) {
      let d = this.#m, f;
      for (; f = d?.shift(); ) this.#o?.(...f);
    }
    return this;
  }
  pop() {
    try {
      for (; this.#h; ) {
        let t = this.#i[this.#b];
        if (this.#B(true), this.#l(t)) {
          if (t.__staleWhileFetching) return t.__staleWhileFetching;
        } else if (t !== void 0) return t;
      }
    } finally {
      if (this.#e && this.#m) {
        let t = this.#m, e;
        for (; e = t?.shift(); ) this.#o?.(...e);
      }
    }
  }
  #B(t) {
    let e = this.#b, s = this.#a[e], i = this.#i[e];
    return this.#A && this.#l(i) ? i.__abortController.abort(new Error("evicted")) : (this.#x || this.#e) && (this.#x && this.#n?.(i, s, "evict"), this.#e && this.#m?.push([i, s, "evict"])), this.#P(e), this.#y?.[e] && (clearTimeout(this.#y[e]), this.#y[e] = void 0), t && (this.#a[e] = void 0, this.#i[e] = void 0, this.#R.push(e)), this.#h === 1 ? (this.#b = this.#p = 0, this.#R.length = 0) : this.#b = this.#d[e], this.#f.delete(s), this.#h--, e;
  }
  has(t, e = {}) {
    let { updateAgeOnHas: s = this.updateAgeOnHas, status: i } = e, r = this.#f.get(t);
    if (r !== void 0) {
      let o = this.#i[r];
      if (this.#l(o) && o.__staleWhileFetching === void 0) return false;
      if (this.#v(r)) i && (i.has = "stale", this.#N(i, r));
      else return s && this.#k(r), i && (i.has = "hit", this.#N(i, r)), true;
    } else i && (i.has = "miss");
    return false;
  }
  peek(t, e = {}) {
    let { allowStale: s = this.allowStale } = e, i = this.#f.get(t);
    if (i === void 0 || !s && this.#v(i)) return;
    let r = this.#i[i];
    return this.#l(r) ? r.__staleWhileFetching : r;
  }
  #U(t, e, s, i) {
    let r = e === void 0 ? void 0 : this.#i[e];
    if (this.#l(r)) return r;
    let o = new At(), { signal: h } = s;
    h?.addEventListener("abort", () => o.abort(h.reason), { signal: o.signal });
    let a = { signal: o.signal, options: s, context: i }, l = (p, w = false) => {
      let { aborted: g } = o.signal, S = s.ignoreFetchAbort && p !== void 0, E = s.ignoreFetchAbort || !!(s.allowStaleOnFetchAbort && p !== void 0);
      if (s.status && (g && !w ? (s.status.fetchAborted = true, s.status.fetchError = o.signal.reason, S && (s.status.fetchAbortIgnored = true)) : s.status.fetchResolved = true), g && !S && !w) return c(o.signal.reason, E);
      let y = f, b = this.#i[e];
      return (b === f || S && w && b === void 0) && (p === void 0 ? y.__staleWhileFetching !== void 0 ? this.#i[e] = y.__staleWhileFetching : this.#O(t, "fetch") : (s.status && (s.status.fetchUpdated = true), this.set(t, p, a.options))), p;
    }, u = (p) => (s.status && (s.status.fetchRejected = true, s.status.fetchError = p), c(p, false)), c = (p, w) => {
      let { aborted: g } = o.signal, S = g && s.allowStaleOnFetchAbort, E = S || s.allowStaleOnFetchRejection, y = E || s.noDeleteOnFetchRejection, b = f;
      if (this.#i[e] === f && (!y || !w && b.__staleWhileFetching === void 0 ? this.#O(t, "fetch") : S || (this.#i[e] = b.__staleWhileFetching)), E) return s.status && b.__staleWhileFetching !== void 0 && (s.status.returnedStale = true), b.__staleWhileFetching;
      if (b.__returned === b) throw p;
    }, d = (p, w) => {
      let g = this.#S?.(t, r, a);
      g && g instanceof Promise && g.then((S) => p(S === void 0 ? void 0 : S), w), o.signal.addEventListener("abort", () => {
        (!s.ignoreFetchAbort || s.allowStaleOnFetchAbort) && (p(void 0), s.allowStaleOnFetchAbort && (p = (S) => l(S, true)));
      });
    };
    s.status && (s.status.fetchDispatched = true);
    let f = new Promise(d).then(l, u), m = Object.assign(f, { __abortController: o, __staleWhileFetching: r, __returned: void 0 });
    return e === void 0 ? (this.set(t, m, { ...a.options, status: void 0 }), e = this.#f.get(t)) : this.#i[e] = m, m;
  }
  #l(t) {
    if (!this.#A) return false;
    let e = t;
    return !!e && e instanceof Promise && e.hasOwnProperty("__staleWhileFetching") && e.__abortController instanceof At;
  }
  async fetch(t, e = {}) {
    let { allowStale: s = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: r = this.noDeleteOnStaleGet, ttl: o = this.ttl, noDisposeOnSet: h = this.noDisposeOnSet, size: a = 0, sizeCalculation: l = this.sizeCalculation, noUpdateTTL: u = this.noUpdateTTL, noDeleteOnFetchRejection: c = this.noDeleteOnFetchRejection, allowStaleOnFetchRejection: d = this.allowStaleOnFetchRejection, ignoreFetchAbort: f = this.ignoreFetchAbort, allowStaleOnFetchAbort: m = this.allowStaleOnFetchAbort, context: p, forceRefresh: w = false, status: g, signal: S } = e;
    if (!this.#A) return g && (g.fetch = "get"), this.get(t, { allowStale: s, updateAgeOnGet: i, noDeleteOnStaleGet: r, status: g });
    let E = { allowStale: s, updateAgeOnGet: i, noDeleteOnStaleGet: r, ttl: o, noDisposeOnSet: h, size: a, sizeCalculation: l, noUpdateTTL: u, noDeleteOnFetchRejection: c, allowStaleOnFetchRejection: d, allowStaleOnFetchAbort: m, ignoreFetchAbort: f, status: g, signal: S }, y = this.#f.get(t);
    if (y === void 0) {
      g && (g.fetch = "miss");
      let b = this.#U(t, y, E, p);
      return b.__returned = b;
    } else {
      let b = this.#i[y];
      if (this.#l(b)) {
        let Z = s && b.__staleWhileFetching !== void 0;
        return g && (g.fetch = "inflight", Z && (g.returnedStale = true)), Z ? b.__staleWhileFetching : b.__returned = b;
      }
      let z = this.#v(y);
      if (!w && !z) return g && (g.fetch = "hit"), this.#W(y), i && this.#k(y), g && this.#N(g, y), b;
      let $ = this.#U(t, y, E, p), J = $.__staleWhileFetching !== void 0 && s;
      return g && (g.fetch = z ? "stale" : "refresh", J && z && (g.returnedStale = true)), J ? $.__staleWhileFetching : $.__returned = $;
    }
  }
  async forceFetch(t, e = {}) {
    let s = await this.fetch(t, e);
    if (s === void 0) throw new Error("fetch() returned undefined");
    return s;
  }
  memo(t, e = {}) {
    let s = this.#w;
    if (!s) throw new Error("no memoMethod provided to constructor");
    let { context: i, forceRefresh: r, ...o } = e, h = this.get(t, o);
    if (!r && h !== void 0) return h;
    let a = s(t, h, { options: o, context: i });
    return this.set(t, a, o), a;
  }
  get(t, e = {}) {
    let { allowStale: s = this.allowStale, updateAgeOnGet: i = this.updateAgeOnGet, noDeleteOnStaleGet: r = this.noDeleteOnStaleGet, status: o } = e, h = this.#f.get(t);
    if (h !== void 0) {
      let a = this.#i[h], l = this.#l(a);
      return o && this.#N(o, h), this.#v(h) ? (o && (o.get = "stale"), l ? (o && s && a.__staleWhileFetching !== void 0 && (o.returnedStale = true), s ? a.__staleWhileFetching : void 0) : (r || this.#O(t, "expire"), o && s && (o.returnedStale = true), s ? a : void 0)) : (o && (o.get = "hit"), l ? a.__staleWhileFetching : (this.#W(h), i && this.#k(h), a));
    } else o && (o.get = "miss");
  }
  #$(t, e) {
    this.#E[e] = t, this.#d[t] = e;
  }
  #W(t) {
    t !== this.#p && (t === this.#b ? this.#b = this.#d[t] : this.#$(this.#E[t], this.#d[t]), this.#$(this.#p, t), this.#p = t);
  }
  delete(t) {
    return this.#O(t, "delete");
  }
  #O(t, e) {
    let s = false;
    if (this.#h !== 0) {
      let i = this.#f.get(t);
      if (i !== void 0) if (this.#y?.[i] && (clearTimeout(this.#y?.[i]), this.#y[i] = void 0), s = true, this.#h === 1) this.#H(e);
      else {
        this.#P(i);
        let r = this.#i[i];
        if (this.#l(r) ? r.__abortController.abort(new Error("deleted")) : (this.#x || this.#e) && (this.#x && this.#n?.(r, t, e), this.#e && this.#m?.push([r, t, e])), this.#f.delete(t), this.#a[i] = void 0, this.#i[i] = void 0, i === this.#p) this.#p = this.#E[i];
        else if (i === this.#b) this.#b = this.#d[i];
        else {
          let o = this.#E[i];
          this.#d[o] = this.#d[i];
          let h = this.#d[i];
          this.#E[h] = this.#E[i];
        }
        this.#h--, this.#R.push(i);
      }
    }
    if (this.#e && this.#m?.length) {
      let i = this.#m, r;
      for (; r = i?.shift(); ) this.#o?.(...r);
    }
    return s;
  }
  clear() {
    return this.#H("delete");
  }
  #H(t) {
    for (let e of this.#D({ allowStale: true })) {
      let s = this.#i[e];
      if (this.#l(s)) s.__abortController.abort(new Error("deleted"));
      else {
        let i = this.#a[e];
        this.#x && this.#n?.(s, i, t), this.#e && this.#m?.push([s, i, t]);
      }
    }
    if (this.#f.clear(), this.#i.fill(void 0), this.#a.fill(void 0), this.#g && this.#T) {
      this.#g.fill(0), this.#T.fill(0);
      for (let e of this.#y ?? []) e !== void 0 && clearTimeout(e);
      this.#y?.fill(void 0);
    }
    if (this.#C && this.#C.fill(0), this.#b = 0, this.#p = 0, this.#R.length = 0, this.#u = 0, this.#h = 0, this.#e && this.#m) {
      let e = this.#m, s;
      for (; s = e?.shift(); ) this.#o?.(...s);
    }
  }
};
var Ne = typeof process == "object" && process ? process : { stdout: null, stderr: null };
var oi = (n7) => !!n7 && typeof n7 == "object" && (n7 instanceof V || n7 instanceof import_node_stream.default || hi(n7) || ai(n7));
var hi = (n7) => !!n7 && typeof n7 == "object" && n7 instanceof import_node_events.EventEmitter && typeof n7.pipe == "function" && n7.pipe !== import_node_stream.default.Writable.prototype.pipe;
var ai = (n7) => !!n7 && typeof n7 == "object" && n7 instanceof import_node_events.EventEmitter && typeof n7.write == "function" && typeof n7.end == "function";
var G = /* @__PURE__ */ Symbol("EOF");
var H = /* @__PURE__ */ Symbol("maybeEmitEnd");
var K = /* @__PURE__ */ Symbol("emittedEnd");
var kt = /* @__PURE__ */ Symbol("emittingEnd");
var ut = /* @__PURE__ */ Symbol("emittedError");
var Rt = /* @__PURE__ */ Symbol("closed");
var _e = /* @__PURE__ */ Symbol("read");
var Ot = /* @__PURE__ */ Symbol("flush");
var Le = /* @__PURE__ */ Symbol("flushChunk");
var P = /* @__PURE__ */ Symbol("encoding");
var et = /* @__PURE__ */ Symbol("decoder");
var v = /* @__PURE__ */ Symbol("flowing");
var dt = /* @__PURE__ */ Symbol("paused");
var st = /* @__PURE__ */ Symbol("resume");
var C = /* @__PURE__ */ Symbol("buffer");
var F = /* @__PURE__ */ Symbol("pipes");
var T = /* @__PURE__ */ Symbol("bufferLength");
var Yt = /* @__PURE__ */ Symbol("bufferPush");
var Ft = /* @__PURE__ */ Symbol("bufferShift");
var k = /* @__PURE__ */ Symbol("objectMode");
var x = /* @__PURE__ */ Symbol("destroyed");
var Xt = /* @__PURE__ */ Symbol("error");
var Jt = /* @__PURE__ */ Symbol("emitData");
var We = /* @__PURE__ */ Symbol("emitEnd");
var Zt = /* @__PURE__ */ Symbol("emitEnd2");
var B = /* @__PURE__ */ Symbol("async");
var Qt = /* @__PURE__ */ Symbol("abort");
var Dt = /* @__PURE__ */ Symbol("aborted");
var pt = /* @__PURE__ */ Symbol("signal");
var Y = /* @__PURE__ */ Symbol("dataListeners");
var M = /* @__PURE__ */ Symbol("discarded");
var mt = (n7) => Promise.resolve().then(n7);
var li = (n7) => n7();
var ci = (n7) => n7 === "end" || n7 === "finish" || n7 === "prefinish";
var fi = (n7) => n7 instanceof ArrayBuffer || !!n7 && typeof n7 == "object" && n7.constructor && n7.constructor.name === "ArrayBuffer" && n7.byteLength >= 0;
var ui = (n7) => !Buffer.isBuffer(n7) && ArrayBuffer.isView(n7);
var Mt = class {
  src;
  dest;
  opts;
  ondrain;
  constructor(t, e, s) {
    this.src = t, this.dest = e, this.opts = s, this.ondrain = () => t[st](), this.dest.on("drain", this.ondrain);
  }
  unpipe() {
    this.dest.removeListener("drain", this.ondrain);
  }
  proxyErrors(t) {
  }
  end() {
    this.unpipe(), this.opts.end && this.dest.end();
  }
};
var te = class extends Mt {
  unpipe() {
    this.src.removeListener("error", this.proxyErrors), super.unpipe();
  }
  constructor(t, e, s) {
    super(t, e, s), this.proxyErrors = (i) => this.dest.emit("error", i), t.on("error", this.proxyErrors);
  }
};
var di = (n7) => !!n7.objectMode;
var pi = (n7) => !n7.objectMode && !!n7.encoding && n7.encoding !== "buffer";
var V = class extends import_node_events.EventEmitter {
  [v] = false;
  [dt] = false;
  [F] = [];
  [C] = [];
  [k];
  [P];
  [B];
  [et];
  [G] = false;
  [K] = false;
  [kt] = false;
  [Rt] = false;
  [ut] = null;
  [T] = 0;
  [x] = false;
  [pt];
  [Dt] = false;
  [Y] = 0;
  [M] = false;
  writable = true;
  readable = true;
  constructor(...t) {
    let e = t[0] || {};
    if (super(), e.objectMode && typeof e.encoding == "string") throw new TypeError("Encoding and objectMode may not be used together");
    di(e) ? (this[k] = true, this[P] = null) : pi(e) ? (this[P] = e.encoding, this[k] = false) : (this[k] = false, this[P] = null), this[B] = !!e.async, this[et] = this[P] ? new import_node_string_decoder.StringDecoder(this[P]) : null, e && e.debugExposeBuffer === true && Object.defineProperty(this, "buffer", { get: () => this[C] }), e && e.debugExposePipes === true && Object.defineProperty(this, "pipes", { get: () => this[F] });
    let { signal: s } = e;
    s && (this[pt] = s, s.aborted ? this[Qt]() : s.addEventListener("abort", () => this[Qt]()));
  }
  get bufferLength() {
    return this[T];
  }
  get encoding() {
    return this[P];
  }
  set encoding(t) {
    throw new Error("Encoding must be set at instantiation time");
  }
  setEncoding(t) {
    throw new Error("Encoding must be set at instantiation time");
  }
  get objectMode() {
    return this[k];
  }
  set objectMode(t) {
    throw new Error("objectMode must be set at instantiation time");
  }
  get async() {
    return this[B];
  }
  set async(t) {
    this[B] = this[B] || !!t;
  }
  [Qt]() {
    this[Dt] = true, this.emit("abort", this[pt]?.reason), this.destroy(this[pt]?.reason);
  }
  get aborted() {
    return this[Dt];
  }
  set aborted(t) {
  }
  write(t, e, s) {
    if (this[Dt]) return false;
    if (this[G]) throw new Error("write after end");
    if (this[x]) return this.emit("error", Object.assign(new Error("Cannot call write after a stream was destroyed"), { code: "ERR_STREAM_DESTROYED" })), true;
    typeof e == "function" && (s = e, e = "utf8"), e || (e = "utf8");
    let i = this[B] ? mt : li;
    if (!this[k] && !Buffer.isBuffer(t)) {
      if (ui(t)) t = Buffer.from(t.buffer, t.byteOffset, t.byteLength);
      else if (fi(t)) t = Buffer.from(t);
      else if (typeof t != "string") throw new Error("Non-contiguous data written to non-objectMode stream");
    }
    return this[k] ? (this[v] && this[T] !== 0 && this[Ot](true), this[v] ? this.emit("data", t) : this[Yt](t), this[T] !== 0 && this.emit("readable"), s && i(s), this[v]) : t.length ? (typeof t == "string" && !(e === this[P] && !this[et]?.lastNeed) && (t = Buffer.from(t, e)), Buffer.isBuffer(t) && this[P] && (t = this[et].write(t)), this[v] && this[T] !== 0 && this[Ot](true), this[v] ? this.emit("data", t) : this[Yt](t), this[T] !== 0 && this.emit("readable"), s && i(s), this[v]) : (this[T] !== 0 && this.emit("readable"), s && i(s), this[v]);
  }
  read(t) {
    if (this[x]) return null;
    if (this[M] = false, this[T] === 0 || t === 0 || t && t > this[T]) return this[H](), null;
    this[k] && (t = null), this[C].length > 1 && !this[k] && (this[C] = [this[P] ? this[C].join("") : Buffer.concat(this[C], this[T])]);
    let e = this[_e](t || null, this[C][0]);
    return this[H](), e;
  }
  [_e](t, e) {
    if (this[k]) this[Ft]();
    else {
      let s = e;
      t === s.length || t === null ? this[Ft]() : typeof s == "string" ? (this[C][0] = s.slice(t), e = s.slice(0, t), this[T] -= t) : (this[C][0] = s.subarray(t), e = s.subarray(0, t), this[T] -= t);
    }
    return this.emit("data", e), !this[C].length && !this[G] && this.emit("drain"), e;
  }
  end(t, e, s) {
    return typeof t == "function" && (s = t, t = void 0), typeof e == "function" && (s = e, e = "utf8"), t !== void 0 && this.write(t, e), s && this.once("end", s), this[G] = true, this.writable = false, (this[v] || !this[dt]) && this[H](), this;
  }
  [st]() {
    this[x] || (!this[Y] && !this[F].length && (this[M] = true), this[dt] = false, this[v] = true, this.emit("resume"), this[C].length ? this[Ot]() : this[G] ? this[H]() : this.emit("drain"));
  }
  resume() {
    return this[st]();
  }
  pause() {
    this[v] = false, this[dt] = true, this[M] = false;
  }
  get destroyed() {
    return this[x];
  }
  get flowing() {
    return this[v];
  }
  get paused() {
    return this[dt];
  }
  [Yt](t) {
    this[k] ? this[T] += 1 : this[T] += t.length, this[C].push(t);
  }
  [Ft]() {
    return this[k] ? this[T] -= 1 : this[T] -= this[C][0].length, this[C].shift();
  }
  [Ot](t = false) {
    do
      ;
    while (this[Le](this[Ft]()) && this[C].length);
    !t && !this[C].length && !this[G] && this.emit("drain");
  }
  [Le](t) {
    return this.emit("data", t), this[v];
  }
  pipe(t, e) {
    if (this[x]) return t;
    this[M] = false;
    let s = this[K];
    return e = e || {}, t === Ne.stdout || t === Ne.stderr ? e.end = false : e.end = e.end !== false, e.proxyErrors = !!e.proxyErrors, s ? e.end && t.end() : (this[F].push(e.proxyErrors ? new te(this, t, e) : new Mt(this, t, e)), this[B] ? mt(() => this[st]()) : this[st]()), t;
  }
  unpipe(t) {
    let e = this[F].find((s) => s.dest === t);
    e && (this[F].length === 1 ? (this[v] && this[Y] === 0 && (this[v] = false), this[F] = []) : this[F].splice(this[F].indexOf(e), 1), e.unpipe());
  }
  addListener(t, e) {
    return this.on(t, e);
  }
  on(t, e) {
    let s = super.on(t, e);
    if (t === "data") this[M] = false, this[Y]++, !this[F].length && !this[v] && this[st]();
    else if (t === "readable" && this[T] !== 0) super.emit("readable");
    else if (ci(t) && this[K]) super.emit(t), this.removeAllListeners(t);
    else if (t === "error" && this[ut]) {
      let i = e;
      this[B] ? mt(() => i.call(this, this[ut])) : i.call(this, this[ut]);
    }
    return s;
  }
  removeListener(t, e) {
    return this.off(t, e);
  }
  off(t, e) {
    let s = super.off(t, e);
    return t === "data" && (this[Y] = this.listeners("data").length, this[Y] === 0 && !this[M] && !this[F].length && (this[v] = false)), s;
  }
  removeAllListeners(t) {
    let e = super.removeAllListeners(t);
    return (t === "data" || t === void 0) && (this[Y] = 0, !this[M] && !this[F].length && (this[v] = false)), e;
  }
  get emittedEnd() {
    return this[K];
  }
  [H]() {
    !this[kt] && !this[K] && !this[x] && this[C].length === 0 && this[G] && (this[kt] = true, this.emit("end"), this.emit("prefinish"), this.emit("finish"), this[Rt] && this.emit("close"), this[kt] = false);
  }
  emit(t, ...e) {
    let s = e[0];
    if (t !== "error" && t !== "close" && t !== x && this[x]) return false;
    if (t === "data") return !this[k] && !s ? false : this[B] ? (mt(() => this[Jt](s)), true) : this[Jt](s);
    if (t === "end") return this[We]();
    if (t === "close") {
      if (this[Rt] = true, !this[K] && !this[x]) return false;
      let r = super.emit("close");
      return this.removeAllListeners("close"), r;
    } else if (t === "error") {
      this[ut] = s, super.emit(Xt, s);
      let r = !this[pt] || this.listeners("error").length ? super.emit("error", s) : false;
      return this[H](), r;
    } else if (t === "resume") {
      let r = super.emit("resume");
      return this[H](), r;
    } else if (t === "finish" || t === "prefinish") {
      let r = super.emit(t);
      return this.removeAllListeners(t), r;
    }
    let i = super.emit(t, ...e);
    return this[H](), i;
  }
  [Jt](t) {
    for (let s of this[F]) s.dest.write(t) === false && this.pause();
    let e = this[M] ? false : super.emit("data", t);
    return this[H](), e;
  }
  [We]() {
    return this[K] ? false : (this[K] = true, this.readable = false, this[B] ? (mt(() => this[Zt]()), true) : this[Zt]());
  }
  [Zt]() {
    if (this[et]) {
      let e = this[et].end();
      if (e) {
        for (let s of this[F]) s.dest.write(e);
        this[M] || super.emit("data", e);
      }
    }
    for (let e of this[F]) e.end();
    let t = super.emit("end");
    return this.removeAllListeners("end"), t;
  }
  async collect() {
    let t = Object.assign([], { dataLength: 0 });
    this[k] || (t.dataLength = 0);
    let e = this.promise();
    return this.on("data", (s) => {
      t.push(s), this[k] || (t.dataLength += s.length);
    }), await e, t;
  }
  async concat() {
    if (this[k]) throw new Error("cannot concat in objectMode");
    let t = await this.collect();
    return this[P] ? t.join("") : Buffer.concat(t, t.dataLength);
  }
  async promise() {
    return new Promise((t, e) => {
      this.on(x, () => e(new Error("stream destroyed"))), this.on("error", (s) => e(s)), this.on("end", () => t());
    });
  }
  [Symbol.asyncIterator]() {
    this[M] = false;
    let t = false, e = async () => (this.pause(), t = true, { value: void 0, done: true });
    return { next: () => {
      if (t) return e();
      let i = this.read();
      if (i !== null) return Promise.resolve({ done: false, value: i });
      if (this[G]) return e();
      let r, o, h = (c) => {
        this.off("data", a), this.off("end", l), this.off(x, u), e(), o(c);
      }, a = (c) => {
        this.off("error", h), this.off("end", l), this.off(x, u), this.pause(), r({ value: c, done: !!this[G] });
      }, l = () => {
        this.off("error", h), this.off("data", a), this.off(x, u), e(), r({ done: true, value: void 0 });
      }, u = () => h(new Error("stream destroyed"));
      return new Promise((c, d) => {
        o = d, r = c, this.once(x, u), this.once("error", h), this.once("end", l), this.once("data", a);
      });
    }, throw: e, return: e, [Symbol.asyncIterator]() {
      return this;
    }, [Symbol.asyncDispose]: async () => {
    } };
  }
  [Symbol.iterator]() {
    this[M] = false;
    let t = false, e = () => (this.pause(), this.off(Xt, e), this.off(x, e), this.off("end", e), t = true, { done: true, value: void 0 }), s = () => {
      if (t) return e();
      let i = this.read();
      return i === null ? e() : { done: false, value: i };
    };
    return this.once("end", e), this.once(Xt, e), this.once(x, e), { next: s, throw: e, return: e, [Symbol.iterator]() {
      return this;
    }, [Symbol.dispose]: () => {
    } };
  }
  destroy(t) {
    if (this[x]) return t ? this.emit("error", t) : this.emit(x), this;
    this[x] = true, this[M] = true, this[C].length = 0, this[T] = 0;
    let e = this;
    return typeof e.close == "function" && !this[Rt] && e.close(), t ? this.emit("error", t) : this.emit(x), this;
  }
  static get isStream() {
    return oi;
  }
};
var vi = import_fs.realpathSync.native;
var wt = { lstatSync: import_fs.lstatSync, readdir: import_fs.readdir, readdirSync: import_fs.readdirSync, readlinkSync: import_fs.readlinkSync, realpathSync: vi, promises: { lstat: import_promises.lstat, readdir: import_promises.readdir, readlink: import_promises.readlink, realpath: import_promises.realpath } };
var Ue = (n7) => !n7 || n7 === wt || n7 === xi ? wt : { ...wt, ...n7, promises: { ...wt.promises, ...n7.promises || {} } };
var $e = /^\\\\\?\\([a-z]:)\\?$/i;
var Ri = (n7) => n7.replace(/\//g, "\\").replace($e, "$1\\");
var Oi = /[\\\/]/;
var L = 0;
var Ge = 1;
var He = 2;
var U = 4;
var qe = 6;
var Ke = 8;
var X = 10;
var Ve = 12;
var _ = 15;
var gt = ~_;
var se = 16;
var je = 32;
var yt = 64;
var j = 128;
var Nt = 256;
var Lt = 512;
var Ie = yt | j | Lt;
var Fi = 1023;
var ie = (n7) => n7.isFile() ? Ke : n7.isDirectory() ? U : n7.isSymbolicLink() ? X : n7.isCharacterDevice() ? He : n7.isBlockDevice() ? qe : n7.isSocket() ? Ve : n7.isFIFO() ? Ge : L;
var ze = new ft({ max: 2 ** 12 });
var bt = (n7) => {
  let t = ze.get(n7);
  if (t) return t;
  let e = n7.normalize("NFKD");
  return ze.set(n7, e), e;
};
var Be = new ft({ max: 2 ** 12 });
var _t = (n7) => {
  let t = Be.get(n7);
  if (t) return t;
  let e = bt(n7.toLowerCase());
  return Be.set(n7, e), e;
};
var Wt = class extends ft {
  constructor() {
    super({ max: 256 });
  }
};
var ne = class extends ft {
  constructor(t = 16 * 1024) {
    super({ maxSize: t, sizeCalculation: (e) => e.length + 1 });
  }
};
var Ye = /* @__PURE__ */ Symbol("PathScurry setAsCwd");
var R = class {
  name;
  root;
  roots;
  parent;
  nocase;
  isCWD = false;
  #t;
  #s;
  get dev() {
    return this.#s;
  }
  #n;
  get mode() {
    return this.#n;
  }
  #r;
  get nlink() {
    return this.#r;
  }
  #o;
  get uid() {
    return this.#o;
  }
  #S;
  get gid() {
    return this.#S;
  }
  #w;
  get rdev() {
    return this.#w;
  }
  #c;
  get blksize() {
    return this.#c;
  }
  #h;
  get ino() {
    return this.#h;
  }
  #u;
  get size() {
    return this.#u;
  }
  #f;
  get blocks() {
    return this.#f;
  }
  #a;
  get atimeMs() {
    return this.#a;
  }
  #i;
  get mtimeMs() {
    return this.#i;
  }
  #d;
  get ctimeMs() {
    return this.#d;
  }
  #E;
  get birthtimeMs() {
    return this.#E;
  }
  #b;
  get atime() {
    return this.#b;
  }
  #p;
  get mtime() {
    return this.#p;
  }
  #R;
  get ctime() {
    return this.#R;
  }
  #m;
  get birthtime() {
    return this.#m;
  }
  #C;
  #T;
  #g;
  #y;
  #x;
  #A;
  #e;
  #_;
  #M;
  #k;
  get parentPath() {
    return (this.parent || this).fullpath();
  }
  get path() {
    return this.parentPath;
  }
  constructor(t, e = L, s, i, r, o, h) {
    this.name = t, this.#C = r ? _t(t) : bt(t), this.#e = e & Fi, this.nocase = r, this.roots = i, this.root = s || this, this.#_ = o, this.#g = h.fullpath, this.#x = h.relative, this.#A = h.relativePosix, this.parent = h.parent, this.parent ? this.#t = this.parent.#t : this.#t = Ue(h.fs);
  }
  depth() {
    return this.#T !== void 0 ? this.#T : this.parent ? this.#T = this.parent.depth() + 1 : this.#T = 0;
  }
  childrenCache() {
    return this.#_;
  }
  resolve(t) {
    if (!t) return this;
    let e = this.getRootString(t), i = t.substring(e.length).split(this.splitSep);
    return e ? this.getRoot(e).#N(i) : this.#N(i);
  }
  #N(t) {
    let e = this;
    for (let s of t) e = e.child(s);
    return e;
  }
  children() {
    let t = this.#_.get(this);
    if (t) return t;
    let e = Object.assign([], { provisional: 0 });
    return this.#_.set(this, e), this.#e &= ~se, e;
  }
  child(t, e) {
    if (t === "" || t === ".") return this;
    if (t === "..") return this.parent || this;
    let s = this.children(), i = this.nocase ? _t(t) : bt(t);
    for (let a of s) if (a.#C === i) return a;
    let r = this.parent ? this.sep : "", o = this.#g ? this.#g + r + t : void 0, h = this.newChild(t, L, { ...e, parent: this, fullpath: o });
    return this.canReaddir() || (h.#e |= j), s.push(h), h;
  }
  relative() {
    if (this.isCWD) return "";
    if (this.#x !== void 0) return this.#x;
    let t = this.name, e = this.parent;
    if (!e) return this.#x = this.name;
    let s = e.relative();
    return s + (!s || !e.parent ? "" : this.sep) + t;
  }
  relativePosix() {
    if (this.sep === "/") return this.relative();
    if (this.isCWD) return "";
    if (this.#A !== void 0) return this.#A;
    let t = this.name, e = this.parent;
    if (!e) return this.#A = this.fullpathPosix();
    let s = e.relativePosix();
    return s + (!s || !e.parent ? "" : "/") + t;
  }
  fullpath() {
    if (this.#g !== void 0) return this.#g;
    let t = this.name, e = this.parent;
    if (!e) return this.#g = this.name;
    let i = e.fullpath() + (e.parent ? this.sep : "") + t;
    return this.#g = i;
  }
  fullpathPosix() {
    if (this.#y !== void 0) return this.#y;
    if (this.sep === "/") return this.#y = this.fullpath();
    if (!this.parent) {
      let i = this.fullpath().replace(/\\/g, "/");
      return /^[a-z]:\//i.test(i) ? this.#y = `//?/${i}` : this.#y = i;
    }
    let t = this.parent, e = t.fullpathPosix(), s = e + (!e || !t.parent ? "" : "/") + this.name;
    return this.#y = s;
  }
  isUnknown() {
    return (this.#e & _) === L;
  }
  isType(t) {
    return this[`is${t}`]();
  }
  getType() {
    return this.isUnknown() ? "Unknown" : this.isDirectory() ? "Directory" : this.isFile() ? "File" : this.isSymbolicLink() ? "SymbolicLink" : this.isFIFO() ? "FIFO" : this.isCharacterDevice() ? "CharacterDevice" : this.isBlockDevice() ? "BlockDevice" : this.isSocket() ? "Socket" : "Unknown";
  }
  isFile() {
    return (this.#e & _) === Ke;
  }
  isDirectory() {
    return (this.#e & _) === U;
  }
  isCharacterDevice() {
    return (this.#e & _) === He;
  }
  isBlockDevice() {
    return (this.#e & _) === qe;
  }
  isFIFO() {
    return (this.#e & _) === Ge;
  }
  isSocket() {
    return (this.#e & _) === Ve;
  }
  isSymbolicLink() {
    return (this.#e & X) === X;
  }
  lstatCached() {
    return this.#e & je ? this : void 0;
  }
  readlinkCached() {
    return this.#M;
  }
  realpathCached() {
    return this.#k;
  }
  readdirCached() {
    let t = this.children();
    return t.slice(0, t.provisional);
  }
  canReadlink() {
    if (this.#M) return true;
    if (!this.parent) return false;
    let t = this.#e & _;
    return !(t !== L && t !== X || this.#e & Nt || this.#e & j);
  }
  calledReaddir() {
    return !!(this.#e & se);
  }
  isENOENT() {
    return !!(this.#e & j);
  }
  isNamed(t) {
    return this.nocase ? this.#C === _t(t) : this.#C === bt(t);
  }
  async readlink() {
    let t = this.#M;
    if (t) return t;
    if (this.canReadlink() && this.parent) try {
      let e = await this.#t.promises.readlink(this.fullpath()), s = (await this.parent.realpath())?.resolve(e);
      if (s) return this.#M = s;
    } catch (e) {
      this.#D(e.code);
      return;
    }
  }
  readlinkSync() {
    let t = this.#M;
    if (t) return t;
    if (this.canReadlink() && this.parent) try {
      let e = this.#t.readlinkSync(this.fullpath()), s = this.parent.realpathSync()?.resolve(e);
      if (s) return this.#M = s;
    } catch (e) {
      this.#D(e.code);
      return;
    }
  }
  #j(t) {
    this.#e |= se;
    for (let e = t.provisional; e < t.length; e++) {
      let s = t[e];
      s && s.#v();
    }
  }
  #v() {
    this.#e & j || (this.#e = (this.#e | j) & gt, this.#G());
  }
  #G() {
    let t = this.children();
    t.provisional = 0;
    for (let e of t) e.#v();
  }
  #P() {
    this.#e |= Lt, this.#L();
  }
  #L() {
    if (this.#e & yt) return;
    let t = this.#e;
    (t & _) === U && (t &= gt), this.#e = t | yt, this.#G();
  }
  #I(t = "") {
    t === "ENOTDIR" || t === "EPERM" ? this.#L() : t === "ENOENT" ? this.#v() : this.children().provisional = 0;
  }
  #F(t = "") {
    t === "ENOTDIR" ? this.parent.#L() : t === "ENOENT" && this.#v();
  }
  #D(t = "") {
    let e = this.#e;
    e |= Nt, t === "ENOENT" && (e |= j), (t === "EINVAL" || t === "UNKNOWN") && (e &= gt), this.#e = e, t === "ENOTDIR" && this.parent && this.parent.#L();
  }
  #z(t, e) {
    return this.#U(t, e) || this.#B(t, e);
  }
  #B(t, e) {
    let s = ie(t), i = this.newChild(t.name, s, { parent: this }), r = i.#e & _;
    return r !== U && r !== X && r !== L && (i.#e |= yt), e.unshift(i), e.provisional++, i;
  }
  #U(t, e) {
    for (let s = e.provisional; s < e.length; s++) {
      let i = e[s];
      if ((this.nocase ? _t(t.name) : bt(t.name)) === i.#C) return this.#l(t, i, s, e);
    }
  }
  #l(t, e, s, i) {
    let r = e.name;
    return e.#e = e.#e & gt | ie(t), r !== t.name && (e.name = t.name), s !== i.provisional && (s === i.length - 1 ? i.pop() : i.splice(s, 1), i.unshift(e)), i.provisional++, e;
  }
  async lstat() {
    if ((this.#e & j) === 0) try {
      return this.#$(await this.#t.promises.lstat(this.fullpath())), this;
    } catch (t) {
      this.#F(t.code);
    }
  }
  lstatSync() {
    if ((this.#e & j) === 0) try {
      return this.#$(this.#t.lstatSync(this.fullpath())), this;
    } catch (t) {
      this.#F(t.code);
    }
  }
  #$(t) {
    let { atime: e, atimeMs: s, birthtime: i, birthtimeMs: r, blksize: o, blocks: h, ctime: a, ctimeMs: l, dev: u, gid: c, ino: d, mode: f, mtime: m, mtimeMs: p, nlink: w, rdev: g, size: S, uid: E } = t;
    this.#b = e, this.#a = s, this.#m = i, this.#E = r, this.#c = o, this.#f = h, this.#R = a, this.#d = l, this.#s = u, this.#S = c, this.#h = d, this.#n = f, this.#p = m, this.#i = p, this.#r = w, this.#w = g, this.#u = S, this.#o = E;
    let y = ie(t);
    this.#e = this.#e & gt | y | je, y !== L && y !== U && y !== X && (this.#e |= yt);
  }
  #W = [];
  #O = false;
  #H(t) {
    this.#O = false;
    let e = this.#W.slice();
    this.#W.length = 0, e.forEach((s) => s(null, t));
  }
  readdirCB(t, e = false) {
    if (!this.canReaddir()) {
      e ? t(null, []) : queueMicrotask(() => t(null, []));
      return;
    }
    let s = this.children();
    if (this.calledReaddir()) {
      let r = s.slice(0, s.provisional);
      e ? t(null, r) : queueMicrotask(() => t(null, r));
      return;
    }
    if (this.#W.push(t), this.#O) return;
    this.#O = true;
    let i = this.fullpath();
    this.#t.readdir(i, { withFileTypes: true }, (r, o) => {
      if (r) this.#I(r.code), s.provisional = 0;
      else {
        for (let h of o) this.#z(h, s);
        this.#j(s);
      }
      this.#H(s.slice(0, s.provisional));
    });
  }
  #q;
  async readdir() {
    if (!this.canReaddir()) return [];
    let t = this.children();
    if (this.calledReaddir()) return t.slice(0, t.provisional);
    let e = this.fullpath();
    if (this.#q) await this.#q;
    else {
      let s = () => {
      };
      this.#q = new Promise((i) => s = i);
      try {
        for (let i of await this.#t.promises.readdir(e, { withFileTypes: true })) this.#z(i, t);
        this.#j(t);
      } catch (i) {
        this.#I(i.code), t.provisional = 0;
      }
      this.#q = void 0, s();
    }
    return t.slice(0, t.provisional);
  }
  readdirSync() {
    if (!this.canReaddir()) return [];
    let t = this.children();
    if (this.calledReaddir()) return t.slice(0, t.provisional);
    let e = this.fullpath();
    try {
      for (let s of this.#t.readdirSync(e, { withFileTypes: true })) this.#z(s, t);
      this.#j(t);
    } catch (s) {
      this.#I(s.code), t.provisional = 0;
    }
    return t.slice(0, t.provisional);
  }
  canReaddir() {
    if (this.#e & Ie) return false;
    let t = _ & this.#e;
    return t === L || t === U || t === X;
  }
  shouldWalk(t, e) {
    return (this.#e & U) === U && !(this.#e & Ie) && !t.has(this) && (!e || e(this));
  }
  async realpath() {
    if (this.#k) return this.#k;
    if (!((Lt | Nt | j) & this.#e)) try {
      let t = await this.#t.promises.realpath(this.fullpath());
      return this.#k = this.resolve(t);
    } catch {
      this.#P();
    }
  }
  realpathSync() {
    if (this.#k) return this.#k;
    if (!((Lt | Nt | j) & this.#e)) try {
      let t = this.#t.realpathSync(this.fullpath());
      return this.#k = this.resolve(t);
    } catch {
      this.#P();
    }
  }
  [Ye](t) {
    if (t === this) return;
    t.isCWD = false, this.isCWD = true;
    let e = /* @__PURE__ */ new Set([]), s = [], i = this;
    for (; i && i.parent; ) e.add(i), i.#x = s.join(this.sep), i.#A = s.join("/"), i = i.parent, s.push("..");
    for (i = t; i && i.parent && !e.has(i); ) i.#x = void 0, i.#A = void 0, i = i.parent;
  }
};
var Pt = class n2 extends R {
  sep = "\\";
  splitSep = Oi;
  constructor(t, e = L, s, i, r, o, h) {
    super(t, e, s, i, r, o, h);
  }
  newChild(t, e = L, s = {}) {
    return new n2(t, e, this.root, this.roots, this.nocase, this.childrenCache(), s);
  }
  getRootString(t) {
    return import_node_path.win32.parse(t).root;
  }
  getRoot(t) {
    if (t = Ri(t.toUpperCase()), t === this.root.name) return this.root;
    for (let [e, s] of Object.entries(this.roots)) if (this.sameRoot(t, e)) return this.roots[t] = s;
    return this.roots[t] = new it(t, this).root;
  }
  sameRoot(t, e = this.root.name) {
    return t = t.toUpperCase().replace(/\//g, "\\").replace($e, "$1\\"), t === e;
  }
};
var jt = class n3 extends R {
  splitSep = "/";
  sep = "/";
  constructor(t, e = L, s, i, r, o, h) {
    super(t, e, s, i, r, o, h);
  }
  getRootString(t) {
    return t.startsWith("/") ? "/" : "";
  }
  getRoot(t) {
    return this.root;
  }
  newChild(t, e = L, s = {}) {
    return new n3(t, e, this.root, this.roots, this.nocase, this.childrenCache(), s);
  }
};
var It = class {
  root;
  rootPath;
  roots;
  cwd;
  #t;
  #s;
  #n;
  nocase;
  #r;
  constructor(t = process.cwd(), e, s, { nocase: i, childrenCacheSize: r = 16 * 1024, fs: o = wt } = {}) {
    this.#r = Ue(o), (t instanceof URL || t.startsWith("file://")) && (t = (0, import_node_url2.fileURLToPath)(t));
    let h = e.resolve(t);
    this.roots = /* @__PURE__ */ Object.create(null), this.rootPath = this.parseRootPath(h), this.#t = new Wt(), this.#s = new Wt(), this.#n = new ne(r);
    let a = h.substring(this.rootPath.length).split(s);
    if (a.length === 1 && !a[0] && a.pop(), i === void 0) throw new TypeError("must provide nocase setting to PathScurryBase ctor");
    this.nocase = i, this.root = this.newRoot(this.#r), this.roots[this.rootPath] = this.root;
    let l = this.root, u = a.length - 1, c = e.sep, d = this.rootPath, f = false;
    for (let m of a) {
      let p = u--;
      l = l.child(m, { relative: new Array(p).fill("..").join(c), relativePosix: new Array(p).fill("..").join("/"), fullpath: d += (f ? "" : c) + m }), f = true;
    }
    this.cwd = l;
  }
  depth(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.depth();
  }
  childrenCache() {
    return this.#n;
  }
  resolve(...t) {
    let e = "";
    for (let r = t.length - 1; r >= 0; r--) {
      let o = t[r];
      if (!(!o || o === ".") && (e = e ? `${o}/${e}` : o, this.isAbsolute(o))) break;
    }
    let s = this.#t.get(e);
    if (s !== void 0) return s;
    let i = this.cwd.resolve(e).fullpath();
    return this.#t.set(e, i), i;
  }
  resolvePosix(...t) {
    let e = "";
    for (let r = t.length - 1; r >= 0; r--) {
      let o = t[r];
      if (!(!o || o === ".") && (e = e ? `${o}/${e}` : o, this.isAbsolute(o))) break;
    }
    let s = this.#s.get(e);
    if (s !== void 0) return s;
    let i = this.cwd.resolve(e).fullpathPosix();
    return this.#s.set(e, i), i;
  }
  relative(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.relative();
  }
  relativePosix(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.relativePosix();
  }
  basename(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.name;
  }
  dirname(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), (t.parent || t).fullpath();
  }
  async readdir(t = this.cwd, e = { withFileTypes: true }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s } = e;
    if (t.canReaddir()) {
      let i = await t.readdir();
      return s ? i : i.map((r) => r.name);
    } else return [];
  }
  readdirSync(t = this.cwd, e = { withFileTypes: true }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true } = e;
    return t.canReaddir() ? s ? t.readdirSync() : t.readdirSync().map((i) => i.name) : [];
  }
  async lstat(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.lstat();
  }
  lstatSync(t = this.cwd) {
    return typeof t == "string" && (t = this.cwd.resolve(t)), t.lstatSync();
  }
  async readlink(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = await t.readlink();
    return e ? s : s?.fullpath();
  }
  readlinkSync(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = t.readlinkSync();
    return e ? s : s?.fullpath();
  }
  async realpath(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = await t.realpath();
    return e ? s : s?.fullpath();
  }
  realpathSync(t = this.cwd, { withFileTypes: e } = { withFileTypes: false }) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t.withFileTypes, t = this.cwd);
    let s = t.realpathSync();
    return e ? s : s?.fullpath();
  }
  async walk(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = [];
    (!r || r(t)) && h.push(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set(), l = (c, d) => {
      a.add(c), c.readdirCB((f, m) => {
        if (f) return d(f);
        let p = m.length;
        if (!p) return d();
        let w = () => {
          --p === 0 && d();
        };
        for (let g of m) (!r || r(g)) && h.push(s ? g : g.fullpath()), i && g.isSymbolicLink() ? g.realpath().then((S) => S?.isUnknown() ? S.lstat() : S).then((S) => S?.shouldWalk(a, o) ? l(S, w) : w()) : g.shouldWalk(a, o) ? l(g, w) : w();
      }, true);
    }, u = t;
    return new Promise((c, d) => {
      l(u, (f) => {
        if (f) return d(f);
        c(h);
      });
    });
  }
  walkSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = [];
    (!r || r(t)) && h.push(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set([t]);
    for (let l of a) {
      let u = l.readdirSync();
      for (let c of u) {
        (!r || r(c)) && h.push(s ? c : c.fullpath());
        let d = c;
        if (c.isSymbolicLink()) {
          if (!(i && (d = c.realpathSync()))) continue;
          d.isUnknown() && d.lstatSync();
        }
        d.shouldWalk(a, o) && a.add(d);
      }
    }
    return h;
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
  iterate(t = this.cwd, e = {}) {
    return typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd), this.stream(t, e)[Symbol.asyncIterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  *iterateSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e;
    (!r || r(t)) && (yield s ? t : t.fullpath());
    let h = /* @__PURE__ */ new Set([t]);
    for (let a of h) {
      let l = a.readdirSync();
      for (let u of l) {
        (!r || r(u)) && (yield s ? u : u.fullpath());
        let c = u;
        if (u.isSymbolicLink()) {
          if (!(i && (c = u.realpathSync()))) continue;
          c.isUnknown() && c.lstatSync();
        }
        c.shouldWalk(h, o) && h.add(c);
      }
    }
  }
  stream(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = new V({ objectMode: true });
    (!r || r(t)) && h.write(s ? t : t.fullpath());
    let a = /* @__PURE__ */ new Set(), l = [t], u = 0, c = () => {
      let d = false;
      for (; !d; ) {
        let f = l.shift();
        if (!f) {
          u === 0 && h.end();
          return;
        }
        u++, a.add(f);
        let m = (w, g, S = false) => {
          if (w) return h.emit("error", w);
          if (i && !S) {
            let E = [];
            for (let y of g) y.isSymbolicLink() && E.push(y.realpath().then((b) => b?.isUnknown() ? b.lstat() : b));
            if (E.length) {
              Promise.all(E).then(() => m(null, g, true));
              return;
            }
          }
          for (let E of g) E && (!r || r(E)) && (h.write(s ? E : E.fullpath()) || (d = true));
          u--;
          for (let E of g) {
            let y = E.realpathCached() || E;
            y.shouldWalk(a, o) && l.push(y);
          }
          d && !h.flowing ? h.once("drain", c) : p || c();
        }, p = true;
        f.readdirCB(m, true), p = false;
      }
    };
    return c(), h;
  }
  streamSync(t = this.cwd, e = {}) {
    typeof t == "string" ? t = this.cwd.resolve(t) : t instanceof R || (e = t, t = this.cwd);
    let { withFileTypes: s = true, follow: i = false, filter: r, walkFilter: o } = e, h = new V({ objectMode: true }), a = /* @__PURE__ */ new Set();
    (!r || r(t)) && h.write(s ? t : t.fullpath());
    let l = [t], u = 0, c = () => {
      let d = false;
      for (; !d; ) {
        let f = l.shift();
        if (!f) {
          u === 0 && h.end();
          return;
        }
        u++, a.add(f);
        let m = f.readdirSync();
        for (let p of m) (!r || r(p)) && (h.write(s ? p : p.fullpath()) || (d = true));
        u--;
        for (let p of m) {
          let w = p;
          if (p.isSymbolicLink()) {
            if (!(i && (w = p.realpathSync()))) continue;
            w.isUnknown() && w.lstatSync();
          }
          w.shouldWalk(a, o) && l.push(w);
        }
      }
      d && !h.flowing && h.once("drain", c);
    };
    return c(), h;
  }
  chdir(t = this.cwd) {
    let e = this.cwd;
    this.cwd = typeof t == "string" ? this.cwd.resolve(t) : t, this.cwd[Ye](e);
  }
};
var it = class extends It {
  sep = "\\";
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = true } = e;
    super(t, import_node_path.win32, "\\", { ...e, nocase: s }), this.nocase = s;
    for (let i = this.cwd; i; i = i.parent) i.nocase = this.nocase;
  }
  parseRootPath(t) {
    return import_node_path.win32.parse(t).root.toUpperCase();
  }
  newRoot(t) {
    return new Pt(this.rootPath, U, void 0, this.roots, this.nocase, this.childrenCache(), { fs: t });
  }
  isAbsolute(t) {
    return t.startsWith("/") || t.startsWith("\\") || /^[a-z]:(\/|\\)/i.test(t);
  }
};
var rt = class extends It {
  sep = "/";
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = false } = e;
    super(t, import_node_path.posix, "/", { ...e, nocase: s }), this.nocase = s;
  }
  parseRootPath(t) {
    return "/";
  }
  newRoot(t) {
    return new jt(this.rootPath, U, void 0, this.roots, this.nocase, this.childrenCache(), { fs: t });
  }
  isAbsolute(t) {
    return t.startsWith("/");
  }
};
var St = class extends rt {
  constructor(t = process.cwd(), e = {}) {
    let { nocase: s = true } = e;
    super(t, { ...e, nocase: s });
  }
};
var Cr = process.platform === "win32" ? Pt : jt;
var Xe = process.platform === "win32" ? it : process.platform === "darwin" ? St : rt;
var Di = (n7) => n7.length >= 1;
var Mi = (n7) => n7.length >= 1;
var Ni = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
var nt = class n4 {
  #t;
  #s;
  #n;
  length;
  #r;
  #o;
  #S;
  #w;
  #c;
  #h;
  #u = true;
  constructor(t, e, s, i) {
    if (!Di(t)) throw new TypeError("empty pattern list");
    if (!Mi(e)) throw new TypeError("empty glob list");
    if (e.length !== t.length) throw new TypeError("mismatched pattern list and glob list lengths");
    if (this.length = t.length, s < 0 || s >= this.length) throw new TypeError("index out of range");
    if (this.#t = t, this.#s = e, this.#n = s, this.#r = i, this.#n === 0) {
      if (this.isUNC()) {
        let [r, o, h, a, ...l] = this.#t, [u, c, d, f, ...m] = this.#s;
        l[0] === "" && (l.shift(), m.shift());
        let p = [r, o, h, a, ""].join("/"), w = [u, c, d, f, ""].join("/");
        this.#t = [p, ...l], this.#s = [w, ...m], this.length = this.#t.length;
      } else if (this.isDrive() || this.isAbsolute()) {
        let [r, ...o] = this.#t, [h, ...a] = this.#s;
        o[0] === "" && (o.shift(), a.shift());
        let l = r + "/", u = h + "/";
        this.#t = [l, ...o], this.#s = [u, ...a], this.length = this.#t.length;
      }
    }
  }
  [Ni]() {
    return "Pattern <" + this.#s.slice(this.#n).join("/") + ">";
  }
  pattern() {
    return this.#t[this.#n];
  }
  isString() {
    return typeof this.#t[this.#n] == "string";
  }
  isGlobstar() {
    return this.#t[this.#n] === A;
  }
  isRegExp() {
    return this.#t[this.#n] instanceof RegExp;
  }
  globString() {
    return this.#S = this.#S || (this.#n === 0 ? this.isAbsolute() ? this.#s[0] + this.#s.slice(1).join("/") : this.#s.join("/") : this.#s.slice(this.#n).join("/"));
  }
  hasMore() {
    return this.length > this.#n + 1;
  }
  rest() {
    return this.#o !== void 0 ? this.#o : this.hasMore() ? (this.#o = new n4(this.#t, this.#s, this.#n + 1, this.#r), this.#o.#h = this.#h, this.#o.#c = this.#c, this.#o.#w = this.#w, this.#o) : this.#o = null;
  }
  isUNC() {
    let t = this.#t;
    return this.#c !== void 0 ? this.#c : this.#c = this.#r === "win32" && this.#n === 0 && t[0] === "" && t[1] === "" && typeof t[2] == "string" && !!t[2] && typeof t[3] == "string" && !!t[3];
  }
  isDrive() {
    let t = this.#t;
    return this.#w !== void 0 ? this.#w : this.#w = this.#r === "win32" && this.#n === 0 && this.length > 1 && typeof t[0] == "string" && /^[a-z]:$/i.test(t[0]);
  }
  isAbsolute() {
    let t = this.#t;
    return this.#h !== void 0 ? this.#h : this.#h = t[0] === "" && t.length > 1 || this.isDrive() || this.isUNC();
  }
  root() {
    let t = this.#t[0];
    return typeof t == "string" && this.isAbsolute() && this.#n === 0 ? t : "";
  }
  checkFollowGlobstar() {
    return !(this.#n === 0 || !this.isGlobstar() || !this.#u);
  }
  markFollowGlobstar() {
    return this.#n === 0 || !this.isGlobstar() || !this.#u ? false : (this.#u = false, true);
  }
};
var _i = typeof process == "object" && process && typeof process.platform == "string" ? process.platform : "linux";
var ot = class {
  relative;
  relativeChildren;
  absolute;
  absoluteChildren;
  platform;
  mmopts;
  constructor(t, { nobrace: e, nocase: s, noext: i, noglobstar: r, platform: o = _i }) {
    this.relative = [], this.absolute = [], this.relativeChildren = [], this.absoluteChildren = [], this.platform = o, this.mmopts = { dot: true, nobrace: e, nocase: s, noext: i, noglobstar: r, optimizationLevel: 2, platform: o, nocomment: true, nonegate: true };
    for (let h of t) this.add(h);
  }
  add(t) {
    let e = new D(t, this.mmopts);
    for (let s = 0; s < e.set.length; s++) {
      let i = e.set[s], r = e.globParts[s];
      if (!i || !r) throw new Error("invalid pattern object");
      for (; i[0] === "." && r[0] === "."; ) i.shift(), r.shift();
      let o = new nt(i, r, 0, this.platform), h = new D(o.globString(), this.mmopts), a = r[r.length - 1] === "**", l = o.isAbsolute();
      l ? this.absolute.push(h) : this.relative.push(h), a && (l ? this.absoluteChildren.push(h) : this.relativeChildren.push(h));
    }
  }
  ignored(t) {
    let e = t.fullpath(), s = `${e}/`, i = t.relative() || ".", r = `${i}/`;
    for (let o of this.relative) if (o.match(i) || o.match(r)) return true;
    for (let o of this.absolute) if (o.match(e) || o.match(s)) return true;
    return false;
  }
  childrenIgnored(t) {
    let e = t.fullpath() + "/", s = (t.relative() || ".") + "/";
    for (let i of this.relativeChildren) if (i.match(s)) return true;
    for (let i of this.absoluteChildren) if (i.match(e)) return true;
    return false;
  }
};
var oe = class n5 {
  store;
  constructor(t = /* @__PURE__ */ new Map()) {
    this.store = t;
  }
  copy() {
    return new n5(new Map(this.store));
  }
  hasWalked(t, e) {
    return this.store.get(t.fullpath())?.has(e.globString());
  }
  storeWalked(t, e) {
    let s = t.fullpath(), i = this.store.get(s);
    i ? i.add(e.globString()) : this.store.set(s, /* @__PURE__ */ new Set([e.globString()]));
  }
};
var he = class {
  store = /* @__PURE__ */ new Map();
  add(t, e, s) {
    let i = (e ? 2 : 0) | (s ? 1 : 0), r = this.store.get(t);
    this.store.set(t, r === void 0 ? i : i & r);
  }
  entries() {
    return [...this.store.entries()].map(([t, e]) => [t, !!(e & 2), !!(e & 1)]);
  }
};
var ae = class {
  store = /* @__PURE__ */ new Map();
  add(t, e) {
    if (!t.canReaddir()) return;
    let s = this.store.get(t);
    s ? s.find((i) => i.globString() === e.globString()) || s.push(e) : this.store.set(t, [e]);
  }
  get(t) {
    let e = this.store.get(t);
    if (!e) throw new Error("attempting to walk unknown path");
    return e;
  }
  entries() {
    return this.keys().map((t) => [t, this.store.get(t)]);
  }
  keys() {
    return [...this.store.keys()].filter((t) => t.canReaddir());
  }
};
var Et = class n6 {
  hasWalkedCache;
  matches = new he();
  subwalks = new ae();
  patterns;
  follow;
  dot;
  opts;
  constructor(t, e) {
    this.opts = t, this.follow = !!t.follow, this.dot = !!t.dot, this.hasWalkedCache = e ? e.copy() : new oe();
  }
  processPatterns(t, e) {
    this.patterns = e;
    let s = e.map((i) => [t, i]);
    for (let [i, r] of s) {
      this.hasWalkedCache.storeWalked(i, r);
      let o = r.root(), h = r.isAbsolute() && this.opts.absolute !== false;
      if (o) {
        i = i.resolve(o === "/" && this.opts.root !== void 0 ? this.opts.root : o);
        let c = r.rest();
        if (c) r = c;
        else {
          this.matches.add(i, true, false);
          continue;
        }
      }
      if (i.isENOENT()) continue;
      let a, l, u = false;
      for (; typeof (a = r.pattern()) == "string" && (l = r.rest()); ) i = i.resolve(a), r = l, u = true;
      if (a = r.pattern(), l = r.rest(), u) {
        if (this.hasWalkedCache.hasWalked(i, r)) continue;
        this.hasWalkedCache.storeWalked(i, r);
      }
      if (typeof a == "string") {
        let c = a === ".." || a === "" || a === ".";
        this.matches.add(i.resolve(a), h, c);
        continue;
      } else if (a === A) {
        (!i.isSymbolicLink() || this.follow || r.checkFollowGlobstar()) && this.subwalks.add(i, r);
        let c = l?.pattern(), d = l?.rest();
        if (!l || (c === "" || c === ".") && !d) this.matches.add(i, h, c === "" || c === ".");
        else if (c === "..") {
          let f = i.parent || i;
          d ? this.hasWalkedCache.hasWalked(f, d) || this.subwalks.add(f, d) : this.matches.add(f, h, true);
        }
      } else a instanceof RegExp && this.subwalks.add(i, r);
    }
    return this;
  }
  subwalkTargets() {
    return this.subwalks.keys();
  }
  child() {
    return new n6(this.opts, this.hasWalkedCache);
  }
  filterEntries(t, e) {
    let s = this.subwalks.get(t), i = this.child();
    for (let r of e) for (let o of s) {
      let h = o.isAbsolute(), a = o.pattern(), l = o.rest();
      a === A ? i.testGlobstar(r, o, l, h) : a instanceof RegExp ? i.testRegExp(r, a, l, h) : i.testString(r, a, l, h);
    }
    return i;
  }
  testGlobstar(t, e, s, i) {
    if ((this.dot || !t.name.startsWith(".")) && (e.hasMore() || this.matches.add(t, i, false), t.canReaddir() && (this.follow || !t.isSymbolicLink() ? this.subwalks.add(t, e) : t.isSymbolicLink() && (s && e.checkFollowGlobstar() ? this.subwalks.add(t, s) : e.markFollowGlobstar() && this.subwalks.add(t, e)))), s) {
      let r = s.pattern();
      if (typeof r == "string" && r !== ".." && r !== "" && r !== ".") this.testString(t, r, s.rest(), i);
      else if (r === "..") {
        let o = t.parent || t;
        this.subwalks.add(o, s);
      } else r instanceof RegExp && this.testRegExp(t, r, s.rest(), i);
    }
  }
  testRegExp(t, e, s, i) {
    e.test(t.name) && (s ? this.subwalks.add(t, s) : this.matches.add(t, i, false));
  }
  testString(t, e, s, i) {
    t.isNamed(e) && (s ? this.subwalks.add(t, s) : this.matches.add(t, i, false));
  }
};
var Li = (n7, t) => typeof n7 == "string" ? new ot([n7], t) : Array.isArray(n7) ? new ot(n7, t) : n7;
var zt = class {
  path;
  patterns;
  opts;
  seen = /* @__PURE__ */ new Set();
  paused = false;
  aborted = false;
  #t = [];
  #s;
  #n;
  signal;
  maxDepth;
  includeChildMatches;
  constructor(t, e, s) {
    if (this.patterns = t, this.path = e, this.opts = s, this.#n = !s.posix && s.platform === "win32" ? "\\" : "/", this.includeChildMatches = s.includeChildMatches !== false, (s.ignore || !this.includeChildMatches) && (this.#s = Li(s.ignore ?? [], s), !this.includeChildMatches && typeof this.#s.add != "function")) {
      let i = "cannot ignore child matches, ignore lacks add() method.";
      throw new Error(i);
    }
    this.maxDepth = s.maxDepth || 1 / 0, s.signal && (this.signal = s.signal, this.signal.addEventListener("abort", () => {
      this.#t.length = 0;
    }));
  }
  #r(t) {
    return this.seen.has(t) || !!this.#s?.ignored?.(t);
  }
  #o(t) {
    return !!this.#s?.childrenIgnored?.(t);
  }
  pause() {
    this.paused = true;
  }
  resume() {
    if (this.signal?.aborted) return;
    this.paused = false;
    let t;
    for (; !this.paused && (t = this.#t.shift()); ) t();
  }
  onResume(t) {
    this.signal?.aborted || (this.paused ? this.#t.push(t) : t());
  }
  async matchCheck(t, e) {
    if (e && this.opts.nodir) return;
    let s;
    if (this.opts.realpath) {
      if (s = t.realpathCached() || await t.realpath(), !s) return;
      t = s;
    }
    let r = t.isUnknown() || this.opts.stat ? await t.lstat() : t;
    if (this.opts.follow && this.opts.nodir && r?.isSymbolicLink()) {
      let o = await r.realpath();
      o && (o.isUnknown() || this.opts.stat) && await o.lstat();
    }
    return this.matchCheckTest(r, e);
  }
  matchCheckTest(t, e) {
    return t && (this.maxDepth === 1 / 0 || t.depth() <= this.maxDepth) && (!e || t.canReaddir()) && (!this.opts.nodir || !t.isDirectory()) && (!this.opts.nodir || !this.opts.follow || !t.isSymbolicLink() || !t.realpathCached()?.isDirectory()) && !this.#r(t) ? t : void 0;
  }
  matchCheckSync(t, e) {
    if (e && this.opts.nodir) return;
    let s;
    if (this.opts.realpath) {
      if (s = t.realpathCached() || t.realpathSync(), !s) return;
      t = s;
    }
    let r = t.isUnknown() || this.opts.stat ? t.lstatSync() : t;
    if (this.opts.follow && this.opts.nodir && r?.isSymbolicLink()) {
      let o = r.realpathSync();
      o && (o?.isUnknown() || this.opts.stat) && o.lstatSync();
    }
    return this.matchCheckTest(r, e);
  }
  matchFinish(t, e) {
    if (this.#r(t)) return;
    if (!this.includeChildMatches && this.#s?.add) {
      let r = `${t.relativePosix()}/**`;
      this.#s.add(r);
    }
    let s = this.opts.absolute === void 0 ? e : this.opts.absolute;
    this.seen.add(t);
    let i = this.opts.mark && t.isDirectory() ? this.#n : "";
    if (this.opts.withFileTypes) this.matchEmit(t);
    else if (s) {
      let r = this.opts.posix ? t.fullpathPosix() : t.fullpath();
      this.matchEmit(r + i);
    } else {
      let r = this.opts.posix ? t.relativePosix() : t.relative(), o = this.opts.dotRelative && !r.startsWith(".." + this.#n) ? "." + this.#n : "";
      this.matchEmit(r ? o + r + i : "." + i);
    }
  }
  async match(t, e, s) {
    let i = await this.matchCheck(t, s);
    i && this.matchFinish(i, e);
  }
  matchSync(t, e, s) {
    let i = this.matchCheckSync(t, s);
    i && this.matchFinish(i, e);
  }
  walkCB(t, e, s) {
    this.signal?.aborted && s(), this.walkCB2(t, e, new Et(this.opts), s);
  }
  walkCB2(t, e, s, i) {
    if (this.#o(t)) return i();
    if (this.signal?.aborted && i(), this.paused) {
      this.onResume(() => this.walkCB2(t, e, s, i));
      return;
    }
    s.processPatterns(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || (r++, this.match(h, a, l).then(() => o()));
    for (let h of s.subwalkTargets()) {
      if (this.maxDepth !== 1 / 0 && h.depth() >= this.maxDepth) continue;
      r++;
      let a = h.readdirCached();
      h.calledReaddir() ? this.walkCB3(h, a, s, o) : h.readdirCB((l, u) => this.walkCB3(h, u, s, o), true);
    }
    o();
  }
  walkCB3(t, e, s, i) {
    s = s.filterEntries(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || (r++, this.match(h, a, l).then(() => o()));
    for (let [h, a] of s.subwalks.entries()) r++, this.walkCB2(h, a, s.child(), o);
    o();
  }
  walkCBSync(t, e, s) {
    this.signal?.aborted && s(), this.walkCB2Sync(t, e, new Et(this.opts), s);
  }
  walkCB2Sync(t, e, s, i) {
    if (this.#o(t)) return i();
    if (this.signal?.aborted && i(), this.paused) {
      this.onResume(() => this.walkCB2Sync(t, e, s, i));
      return;
    }
    s.processPatterns(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || this.matchSync(h, a, l);
    for (let h of s.subwalkTargets()) {
      if (this.maxDepth !== 1 / 0 && h.depth() >= this.maxDepth) continue;
      r++;
      let a = h.readdirSync();
      this.walkCB3Sync(h, a, s, o);
    }
    o();
  }
  walkCB3Sync(t, e, s, i) {
    s = s.filterEntries(t, e);
    let r = 1, o = () => {
      --r === 0 && i();
    };
    for (let [h, a, l] of s.matches.entries()) this.#r(h) || this.matchSync(h, a, l);
    for (let [h, a] of s.subwalks.entries()) r++, this.walkCB2Sync(h, a, s.child(), o);
    o();
  }
};
var xt = class extends zt {
  matches = /* @__PURE__ */ new Set();
  constructor(t, e, s) {
    super(t, e, s);
  }
  matchEmit(t) {
    this.matches.add(t);
  }
  async walk() {
    if (this.signal?.aborted) throw this.signal.reason;
    return this.path.isUnknown() && await this.path.lstat(), await new Promise((t, e) => {
      this.walkCB(this.path, this.patterns, () => {
        this.signal?.aborted ? e(this.signal.reason) : t(this.matches);
      });
    }), this.matches;
  }
  walkSync() {
    if (this.signal?.aborted) throw this.signal.reason;
    return this.path.isUnknown() && this.path.lstatSync(), this.walkCBSync(this.path, this.patterns, () => {
      if (this.signal?.aborted) throw this.signal.reason;
    }), this.matches;
  }
};
var vt = class extends zt {
  results;
  constructor(t, e, s) {
    super(t, e, s), this.results = new V({ signal: this.signal, objectMode: true }), this.results.on("drain", () => this.resume()), this.results.on("resume", () => this.resume());
  }
  matchEmit(t) {
    this.results.write(t), this.results.flowing || this.pause();
  }
  stream() {
    let t = this.path;
    return t.isUnknown() ? t.lstat().then(() => {
      this.walkCB(t, this.patterns, () => this.results.end());
    }) : this.walkCB(t, this.patterns, () => this.results.end()), this.results;
  }
  streamSync() {
    return this.path.isUnknown() && this.path.lstatSync(), this.walkCBSync(this.path, this.patterns, () => this.results.end()), this.results;
  }
};
var Pi = typeof process == "object" && process && typeof process.platform == "string" ? process.platform : "linux";
var I = class {
  absolute;
  cwd;
  root;
  dot;
  dotRelative;
  follow;
  ignore;
  magicalBraces;
  mark;
  matchBase;
  maxDepth;
  nobrace;
  nocase;
  nodir;
  noext;
  noglobstar;
  pattern;
  platform;
  realpath;
  scurry;
  stat;
  signal;
  windowsPathsNoEscape;
  withFileTypes;
  includeChildMatches;
  opts;
  patterns;
  constructor(t, e) {
    if (!e) throw new TypeError("glob options required");
    if (this.withFileTypes = !!e.withFileTypes, this.signal = e.signal, this.follow = !!e.follow, this.dot = !!e.dot, this.dotRelative = !!e.dotRelative, this.nodir = !!e.nodir, this.mark = !!e.mark, e.cwd ? (e.cwd instanceof URL || e.cwd.startsWith("file://")) && (e.cwd = (0, import_node_url.fileURLToPath)(e.cwd)) : this.cwd = "", this.cwd = e.cwd || "", this.root = e.root, this.magicalBraces = !!e.magicalBraces, this.nobrace = !!e.nobrace, this.noext = !!e.noext, this.realpath = !!e.realpath, this.absolute = e.absolute, this.includeChildMatches = e.includeChildMatches !== false, this.noglobstar = !!e.noglobstar, this.matchBase = !!e.matchBase, this.maxDepth = typeof e.maxDepth == "number" ? e.maxDepth : 1 / 0, this.stat = !!e.stat, this.ignore = e.ignore, this.withFileTypes && this.absolute !== void 0) throw new Error("cannot set absolute and withFileTypes:true");
    if (typeof t == "string" && (t = [t]), this.windowsPathsNoEscape = !!e.windowsPathsNoEscape || e.allowWindowsEscape === false, this.windowsPathsNoEscape && (t = t.map((a) => a.replace(/\\/g, "/"))), this.matchBase) {
      if (e.noglobstar) throw new TypeError("base matching requires globstar");
      t = t.map((a) => a.includes("/") ? a : `./**/${a}`);
    }
    if (this.pattern = t, this.platform = e.platform || Pi, this.opts = { ...e, platform: this.platform }, e.scurry) {
      if (this.scurry = e.scurry, e.nocase !== void 0 && e.nocase !== e.scurry.nocase) throw new Error("nocase option contradicts provided scurry option");
    } else {
      let a = e.platform === "win32" ? it : e.platform === "darwin" ? St : e.platform ? rt : Xe;
      this.scurry = new a(this.cwd, { nocase: e.nocase, fs: e.fs });
    }
    this.nocase = this.scurry.nocase;
    let s = this.platform === "darwin" || this.platform === "win32", i = { braceExpandMax: 1e4, ...e, dot: this.dot, matchBase: this.matchBase, nobrace: this.nobrace, nocase: this.nocase, nocaseMagicOnly: s, nocomment: true, noext: this.noext, nonegate: true, optimizationLevel: 2, platform: this.platform, windowsPathsNoEscape: this.windowsPathsNoEscape, debug: !!this.opts.debug }, r = this.pattern.map((a) => new D(a, i)), [o, h] = r.reduce((a, l) => (a[0].push(...l.set), a[1].push(...l.globParts), a), [[], []]);
    this.patterns = o.map((a, l) => {
      let u = h[l];
      if (!u) throw new Error("invalid pattern object");
      return new nt(a, u, 0, this.platform);
    });
  }
  async walk() {
    return [...await new xt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).walk()];
  }
  walkSync() {
    return [...new xt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).walkSync()];
  }
  stream() {
    return new vt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).stream();
  }
  streamSync() {
    return new vt(this.patterns, this.scurry.cwd, { ...this.opts, maxDepth: this.maxDepth !== 1 / 0 ? this.maxDepth + this.scurry.cwd.depth() : 1 / 0, platform: this.platform, nocase: this.nocase, includeChildMatches: this.includeChildMatches }).streamSync();
  }
  iterateSync() {
    return this.streamSync()[Symbol.iterator]();
  }
  [Symbol.iterator]() {
    return this.iterateSync();
  }
  iterate() {
    return this.stream()[Symbol.asyncIterator]();
  }
  [Symbol.asyncIterator]() {
    return this.iterate();
  }
};
var le = (n7, t = {}) => {
  Array.isArray(n7) || (n7 = [n7]);
  for (let e of n7) if (new D(e, t).hasMagic()) return true;
  return false;
};
function Bt(n7, t = {}) {
  return new I(n7, t).streamSync();
}
function Qe(n7, t = {}) {
  return new I(n7, t).stream();
}
function ts(n7, t = {}) {
  return new I(n7, t).walkSync();
}
async function Je(n7, t = {}) {
  return new I(n7, t).walk();
}
function Ut(n7, t = {}) {
  return new I(n7, t).iterateSync();
}
function es(n7, t = {}) {
  return new I(n7, t).iterate();
}
var ji = Bt;
var Ii = Object.assign(Qe, { sync: Bt });
var zi = Ut;
var Bi = Object.assign(es, { sync: Ut });
var Ui = Object.assign(ts, { stream: Bt, iterate: Ut });
var Ze = Object.assign(Je, { glob: Je, globSync: ts, sync: Ui, globStream: Qe, stream: Ii, globStreamSync: Bt, streamSync: ji, globIterate: es, iterate: Bi, globIterateSync: Ut, iterateSync: zi, Glob: I, hasMagic: le, escape: tt, unescape: W });
Ze.glob = Ze;

// node_modules/@allurereport/ci/dist/reportContext.js
var TEST_RESULTS_REGISTRY_FILENAME = "test-results.json";
var QUALITY_GATE_RESULTS_FILENAME = "quality-gate.json";
var ARTIFACTS_MANIFEST_FILENAME = "artifacts.json";
var SUMMARY_FILENAME = "summary.json";
var TEST_STATUSES = ["failed", "broken", "passed", "skipped", "unknown"];
var emptyStatusStats = () => ({
  failed: 0,
  broken: 0,
  passed: 0,
  skipped: 0,
  unknown: 0,
  total: 0
});
var emptyFlagStats = () => ({
  new: 0,
  flaky: 0,
  retry: 0
});
var emptyResolutionStats = () => ({
  issues: 0,
  muted: 0,
  accepted: 0
});
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isTestStatus = (value) => typeof value === "string" && TEST_STATUSES.includes(value);
var normalizePath = (filePath) => filePath.split(import_node_path2.sep).join("/");
var readOptionalJson = async (filePath, onError) => {
  if (!(0, import_node_fs.existsSync)(filePath)) {
    return void 0;
  }
  try {
    return JSON.parse(await (0, import_promises2.readFile)(filePath, "utf8"));
  } catch (err) {
    onError?.(`Failed to read Allure report context file ${filePath}: ${String(err)}`);
    return void 0;
  }
};
var isPluginSummary = (value) => {
  if (!isRecord(value) || typeof value.name !== "string" || !isRecord(value.stats)) {
    return false;
  }
  return typeof value.duration === "number" && isTestStatus(value.status);
};
var getReportPath = (reportDir, summaryFile) => normalizePath((0, import_node_path2.relative)((0, import_node_path2.resolve)(reportDir), (0, import_node_path2.dirname)((0, import_node_path2.resolve)(summaryFile))));
var readPluginSummary = async (reportDir, filePath, onError) => {
  const value = await readOptionalJson(filePath, onError);
  if (value === void 0) {
    return void 0;
  }
  if (!isPluginSummary(value)) {
    onError?.(`Ignoring unsupported Allure plugin summary file ${filePath}`);
    return void 0;
  }
  return {
    ...value,
    summaryFile: filePath,
    reportPath: getReportPath(reportDir, filePath)
  };
};
var findSummaryFiles = async (reportDir) => (await Ze(`**/${SUMMARY_FILENAME}`, {
  absolute: true,
  cwd: reportDir,
  ignore: [`**/widgets/${SUMMARY_FILENAME}`],
  nodir: true
})).toSorted((left, right) => left.localeCompare(right));
var normalizeTestResultRegistry = (value, onError) => {
  if (!isRecord(value) || !isRecord(value.byId)) {
    if (value !== void 0) {
      onError?.("Ignoring unsupported Allure test result registry shape");
    }
    return void 0;
  }
  return {
    byId: value.byId
  };
};
var normalizeArtifacts = (value, onError) => {
  if (value === void 0) {
    return [];
  }
  if (!Array.isArray(value)) {
    onError?.("Ignoring unsupported Allure artifacts manifest shape");
    return [];
  }
  const byPath = /* @__PURE__ */ new Map();
  value.forEach((artifact) => {
    if (!isRecord(artifact) || typeof artifact.name !== "string" || typeof artifact.path !== "string") {
      return;
    }
    if (!byPath.has(artifact.path)) {
      byPath.set(artifact.path, {
        name: artifact.name,
        path: artifact.path
      });
    }
  });
  return [...byPath.values()].toSorted((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name));
};
var isQualityGateResult = (value) => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.success === "boolean" && typeof value.rule === "string" && typeof value.message === "string";
};
var normalizeQualityGate = (value, onError) => {
  if (Array.isArray(value)) {
    return value.filter(isQualityGateResult);
  }
  if (!isRecord(value)) {
    if (value !== void 0) {
      onError?.("Ignoring unsupported Allure quality gate results shape");
    }
    return void 0;
  }
  const entries = Object.entries(value).flatMap(([environment, results]) => Array.isArray(results) ? [[environment, results.filter(isQualityGateResult)]] : []);
  if (!entries.length) {
    if (Object.keys(value).length > 0) {
      onError?.("Ignoring unsupported Allure quality gate results shape");
    }
    return void 0;
  }
  return Object.fromEntries(entries);
};
var addStatus = (stats, status) => {
  stats[status] += 1;
  stats.total += 1;
};
var getSummaryIdSet = (summaries, key) => new Set(summaries.flatMap((summary) => summary[key] ?? []));
var applyMaxSummaryStats = (stats, summaries) => {
  summaries.forEach((summary) => {
    TEST_STATUSES.forEach((status) => {
      stats[status] = Math.max(stats[status], summary.stats[status] ?? 0);
    });
    stats.total = Math.max(stats.total, summary.stats.total);
  });
};
var createTotals = (registry, summaries) => {
  const totals = {
    stats: emptyStatusStats(),
    flags: emptyFlagStats(),
    resolutions: emptyResolutionStats(),
    duration: 0
  };
  if (!registry) {
    applyMaxSummaryStats(totals.stats, summaries);
    totals.duration = summaries.reduce((max, summary) => Math.max(max, summary.duration), 0);
    return totals;
  }
  Object.values(registry.byId).forEach((testResult) => {
    if (!isRecord(testResult) || !isTestStatus(testResult.status)) {
      return;
    }
    addStatus(totals.stats, testResult.status);
    if (typeof testResult.duration === "number") {
      totals.duration += testResult.duration;
    }
  });
  return totals;
};
var addFlags = (flags, testResultId, newTestIds, flakyTestIds, retryTestIds) => {
  if (newTestIds.has(testResultId)) {
    flags.new += 1;
  }
  if (flakyTestIds.has(testResultId)) {
    flags.flaky += 1;
  }
  if (retryTestIds.has(testResultId)) {
    flags.retry += 1;
  }
};
var createEnvironmentContext = (registry, summaries) => {
  if (!registry) {
    return [];
  }
  const newTestIds = getSummaryIdSet(summaries, "newTests");
  const flakyTestIds = getSummaryIdSet(summaries, "flakyTests");
  const retryTestIds = getSummaryIdSet(summaries, "retryTests");
  const environmentsByName = /* @__PURE__ */ new Map();
  Object.entries(registry.byId).forEach(([testResultId, testResult]) => {
    if (!isRecord(testResult) || !isTestStatus(testResult.status) || typeof testResult.environment !== "string") {
      return;
    }
    const environment = testResult.environment.trim();
    if (!environment || environment === "default") {
      return;
    }
    const context = environmentsByName.get(environment) ?? {
      name: environment,
      stats: emptyStatusStats(),
      flags: emptyFlagStats(),
      duration: 0
    };
    addStatus(context.stats, testResult.status);
    addFlags(context.flags, testResultId, newTestIds, flakyTestIds, retryTestIds);
    if (typeof testResult.duration === "number") {
      context.duration += testResult.duration;
    }
    environmentsByName.set(environment, context);
  });
  return [...environmentsByName.values()].toSorted((left, right) => left.name.localeCompare(right.name));
};
var createReport = (summary) => ({ ...summary });
var sortReports = (reports) => reports.toSorted((left, right) => left.name.localeCompare(right.name));
var getResolutionStats = (summaries) => {
  const stats = emptyResolutionStats();
  summaries.forEach((summary) => {
    stats.issues = Math.max(stats.issues, summary.stats.resolutions?.issues ?? 0);
    stats.muted = Math.max(stats.muted, summary.stats.resolutions?.muted ?? 0);
    stats.accepted = Math.max(stats.accepted, summary.stats.resolutions?.accepted ?? 0);
  });
  return stats;
};
var applySummaryFlags = (totals, summaries) => {
  totals.flags.new = getSummaryIdSet(summaries, "newTests").size;
  totals.flags.flaky = getSummaryIdSet(summaries, "flakyTests").size;
  totals.flags.retry = getSummaryIdSet(summaries, "retryTests").size;
  totals.resolutions = getResolutionStats(summaries);
};
var readReportContextFiles = async (reportDir, options = {}) => {
  const { onError } = options;
  const summaryFiles = await findSummaryFiles(reportDir);
  const reports = (await Promise.all(summaryFiles.map((summaryFile) => readPluginSummary(reportDir, summaryFile, onError)))).filter((summary) => summary !== void 0);
  const registry = normalizeTestResultRegistry(await readOptionalJson((0, import_node_path2.join)(reportDir, TEST_RESULTS_REGISTRY_FILENAME), onError), onError);
  const artifacts = normalizeArtifacts(await readOptionalJson((0, import_node_path2.join)(reportDir, ARTIFACTS_MANIFEST_FILENAME), onError), onError);
  const qualityGate = normalizeQualityGate(await readOptionalJson((0, import_node_path2.join)(reportDir, QUALITY_GATE_RESULTS_FILENAME), onError), onError);
  return {
    reports,
    testResults: registry,
    artifacts,
    qualityGate
  };
};
var createReportContextFromData = (data) => {
  const reports = sortReports(data.reports ?? data.summaries?.map(createReport) ?? []);
  const artifacts = [...data.artifacts ?? []].toSorted((left, right) => left.path.localeCompare(right.path) || left.name.localeCompare(right.name));
  const totals = createTotals(data.testResults, reports);
  applySummaryFlags(totals, reports);
  return {
    reports,
    testResults: data.testResults,
    totals,
    environments: createEnvironmentContext(data.testResults, reports),
    artifacts,
    qualityGate: data.qualityGate
  };
};
var createReportContext = async (reportDir, options = {}) => createReportContextFromData(await readReportContextFiles(reportDir, options));

// dist/report/summary.js
async function readPrReportContext(reportDir, options) {
  const context = await createReportContext(reportDir, { onError: console.warn });
  if (!context.reports.length) {
    throw new Error(`No Allure 3 plugin summaries found in ${reportDir}. Generate the report before creating the PR comment.`);
  }
  context.reports = context.reports.map((report) => {
    let remoteHref = options.forkPr ? void 0 : report.remoteHref;
    if (options.pagesUrl && !options.forkPr) {
      const url = new URL(options.pagesUrl);
      if (!["http:", "https:"].includes(url.protocol)) {
        throw new Error("pages-url must be an HTTP or HTTPS URL");
      }
      if (report.summaryFile && (0, import_node_fs2.existsSync)(import_node_path3.default.join(import_node_path3.default.dirname(report.summaryFile), "index.html"))) {
        const suffix = report.reportPath;
        if (suffix) {
          url.pathname = `${url.pathname.replace(/\/$/, "")}/${suffix}`;
        }
      }
      if (options.sourceRunId)
        url.searchParams.set("run", options.sourceRunId);
      remoteHref = url.toString();
    }
    return { ...report, href: void 0, remoteHref };
  });
  return context;
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
var fs4 = __toESM(require("node:fs"), 1);
var path4 = __toESM(require("node:path"), 1);
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
  const byId = Object.fromEntries(layers.map((L2) => [L2.id, L2]));
  const rows = ["ui_e2e", "api", "unit"].map((id) => byId[id]).filter((layer) => layer !== void 0);
  const maxVisualWidth = 28;
  const maxTotal = Math.max(...rows.map((L2) => L2.stats.total), 1);
  const legendWidth = Math.max(...layers.map((L2) => L2.label.length));
  const countWidth = Math.max(5, ...layers.map((L2) => String(L2.stats.total).length));
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
  fs4.mkdirSync(path4.dirname(outputPath), { recursive: true });
  fs4.writeFileSync(outputPath, JSON.stringify(payload, null, 2), "utf8");
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
  fs4.appendFileSync(summaryPath, markdown, "utf8");
}

// dist/allure/parser.js
var fs5 = __toESM(require("node:fs"), 1);
var path5 = __toESM(require("node:path"), 1);
function listResultFiles(resultsDir) {
  if (!fs5.existsSync(resultsDir))
    return [];
  return fs5.readdirSync(resultsDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith("-result.json")).map((entry) => path5.join(resultsDir, entry.name));
}
function readJsonSafe(file) {
  try {
    return JSON.parse(fs5.readFileSync(file, "utf8"));
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

// dist/commands/badges.js
function runBadges(options) {
  const { resultsDir, reportDir } = options;
  const results = aggregateResults(listResultFiles(resultsDir), (file) => readJsonSafe(file), getEpicForResult);
  generateBadges(results, reportDir);
}

// dist/allure/config-generator.js
var fs6 = __toESM(require("node:fs"), 1);
var path6 = __toESM(require("node:path"), 1);
var import_node_url3 = require("node:url");
var MODULE_VARIABLES_METADATA2 = ".allure-module-variables.json";
var MAX_FRAGMENT_VARIABLES2 = 1e4;
var MAX_FRAGMENT_VARIABLE_BYTES2 = 4 * 1024 * 1024;
var HIDDEN_ENVIRONMENT_VARIABLES = /* @__PURE__ */ new Set(["module", "environment", "job", "runner"]);
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
  const metadata = path6.join(resultsDir, MODULE_VARIABLES_METADATA2);
  if (!fs6.existsSync(metadata))
    return {};
  const stat = fs6.lstatSync(metadata);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FRAGMENT_VARIABLE_BYTES2) {
    throw new Error(`Invalid module environment metadata: ${metadata}`);
  }
  let document;
  try {
    document = JSON.parse(fs6.readFileSync(metadata, "utf8"));
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
  const { resultsDir, configFile, outputFile, moduleLabel, environmentLabel = "environment" } = options;
  if (!moduleLabel.trim()) {
    throw new Error("--module-label must not be empty");
  }
  const configPath = path6.resolve(configFile);
  if (!fs6.existsSync(configPath)) {
    throw new Error(`Allure config not found: ${configFile}`);
  }
  const moduleNames = /* @__PURE__ */ new Set();
  const environmentNames = /* @__PURE__ */ new Set();
  let unmatchedResults = 0;
  for (const file of listResultFiles(resultsDir)) {
    const doc = readJsonSafe(file);
    const moduleName = getLabelValue(doc?.labels, moduleLabel);
    if (moduleName)
      moduleNames.add(moduleName);
    else
      unmatchedResults += 1;
    const environmentName = getLabelValue(doc?.labels, environmentLabel);
    if (environmentName)
      environmentNames.add(environmentName);
  }
  const configUrl = (0, import_node_url3.pathToFileURL)(configPath).href;
  const baseConfigModule = await import(configUrl);
  const baseConfig = baseConfigModule.default || {};
  const allVariables = { ...baseConfig.variables || {} };
  const baseEnvironments = baseConfig.environments || {};
  for (const descriptor of Object.values(baseEnvironments)) {
    Object.assign(allVariables, descriptor?.variables || {});
  }
  Object.assign(allVariables, readModuleVariables(resultsDir));
  for (const [key, value] of Object.entries(allVariables)) {
    if (key.toLowerCase().endsWith(".environment") && String(value || "").trim()) {
      environmentNames.add(String(value).trim());
    }
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
    const source2 = `import baseConfig from ${JSON.stringify(configUrl)};
export default baseConfig;
`;
    fs6.mkdirSync(path6.dirname(outputFile), { recursive: true });
    fs6.writeFileSync(outputFile, source2, "utf8");
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
  const usedEnvironmentIds = /* @__PURE__ */ new Set(["default"]);
  const environments = [...environmentNames].sort((a, b) => a.localeCompare(b)).map((name) => ({
    id: generateEnvironmentId(name, usedEnvironmentIds),
    name,
    variables: {}
  }));
  const environmentsByName = new Map(environments.map((environment) => [environment.name, environment]));
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
  const environmentVariableValues = /* @__PURE__ */ new Map();
  for (const [key, value] of Object.entries(allVariables)) {
    const separator = key.indexOf("::");
    const environment = separator > 0 ? environmentsByName.get(key.slice(0, separator)) : void 0;
    const unscopedKey = separator > 0 ? key.slice(separator + 2) : key;
    if (environment) {
      const parts2 = parseVariableParts(unscopedKey);
      const variableName = parts2?.name || unscopedKey;
      if (!HIDDEN_ENVIRONMENT_VARIABLES.has(variableName.toLowerCase())) {
        const values = environmentVariableValues.get(environment.name) || /* @__PURE__ */ new Map();
        const distinctValues = values.get(variableName) || /* @__PURE__ */ new Set();
        distinctValues.add(String(value));
        values.set(variableName, distinctValues);
        environmentVariableValues.set(environment.name, values);
      }
      continue;
    }
    const parts = parseVariableParts(unscopedKey);
    const declaredModule = parts ? modulesByVariablePrefix.get(parts.prefix) : null;
    const exactMatches = parts && !declaredModule ? modules.filter((candidate) => tokensEqual(candidate.tokens, parts.moduleTokens)) : [];
    const suffixMatches = parts && !declaredModule && exactMatches.length === 0 ? modules.filter((candidate) => tokensEndWith(candidate.tokens, parts.moduleTokens) || tokensEndWith(parts.moduleTokens, candidate.tokens)) : [];
    const matches = exactMatches.length > 0 ? exactMatches : suffixMatches;
    const module2 = declaredModule || (matches.length === 1 ? matches[0] : null);
    if (module2 && parts?.name)
      module2.variables[parts.name] = String(value);
    else
      globalVariables[unscopedKey] = String(value);
  }
  for (const environment of environments) {
    const values = environmentVariableValues.get(environment.name);
    if (!values)
      continue;
    for (const [name, distinctValues] of values) {
      if (distinctValues.size === 1)
        environment.variables[name] = [...distinctValues][0];
    }
  }
  const serializedModules = modules.map(({ id, name, variables }) => ({ id, name, variables }));
  const serializedEnvironments = environments.map(({ id, name, variables }) => ({ id, name, variables }));
  const source = `import baseConfig from ${JSON.stringify(configUrl)};
const moduleLabel = ${JSON.stringify(moduleLabel)};
const environmentLabel = ${JSON.stringify(environmentLabel)};
const modules = ${JSON.stringify(serializedModules, null, 2)};
const moduleEnvironments = Object.fromEntries(modules.map(({ id, name, variables }) => [id, {
  name,
  variables,
  matcher: ({ labels }) => Array.isArray(labels) && labels.some(
    (label) => label?.name === moduleLabel && String(label?.value || "").trim() === name,
  ),
}]));
const environments = Object.fromEntries(${JSON.stringify(serializedEnvironments)}.map(({ id, name, variables }) => [id, {
  name,
  variables,
  matcher: ({ labels }) => Array.isArray(labels) && labels.some(
    (label) => label?.name === environmentLabel && String(label?.value || "").trim() === name,
  ),
}]));
export default {
  ...baseConfig,
  variables: ${JSON.stringify(globalVariables, null, 2)},
  environments: Object.keys(environments).length > 0 ? environments : moduleEnvironments,
};
`;
  fs6.mkdirSync(path6.dirname(outputFile), { recursive: true });
  fs6.writeFileSync(outputFile, source, "utf8");
  console.log(`Prepared ${modules.length} module environment(s) from ${moduleLabel}; ${unmatchedResults} result(s) use default environment.`);
}

// dist/commands/module-config.js
async function runModuleConfig(options) {
  await generateModuleConfig(options);
}

// dist/commands/pr-body.js
var fs7 = __toESM(require("node:fs"), 1);

// node_modules/@allurereport/ci/dist/reportMarkdown.js
var STATUS_ORDER = ["passed", "failed", "broken", "skipped", "unknown"];
var STATUS_LABELS = {
  passed: "Passed tests",
  failed: "Failed tests",
  broken: "Broken tests",
  skipped: "Skipped tests",
  unknown: "Unknown tests"
};
var STATUS_ICON_BASE_URL = "https://allurecharts.qameta.workers.dev/dot";
var STATUS_PIE_BASE_URL = "https://allurecharts.qameta.workers.dev/pie";
var escapeHtml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
var tableCell = (value) => escapeHtml(String(value)).replaceAll("|", "&#124;").replaceAll("\n", "<br>");
var isSafeHref = (href) => {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href);
  }
};
var link = (label, href) => isSafeHref(href) ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a>` : escapeHtml(label);
var statusIcon = (status) => `<img alt="${STATUS_LABELS[status]}" src="${STATUS_ICON_BASE_URL}?type=${status}&size=8" width="8" height="8" />`;
var statusPie = (stats) => {
  const total = STATUS_ORDER.reduce((sum, status) => sum + (stats[status] ?? 0), 0);
  if (total === 0) {
    return "";
  }
  const params = new URLSearchParams({
    passed: String(stats.passed ?? 0),
    failed: String(stats.failed ?? 0),
    broken: String(stats.broken ?? 0),
    skipped: String(stats.skipped ?? 0),
    unknown: String(stats.unknown ?? 0),
    size: "32"
  });
  return `<img src="${STATUS_PIE_BASE_URL}?${params.toString()}" width="28px" height="28px" />&nbsp;&nbsp;&nbsp;&nbsp;`;
};
var formatDuration = (duration) => {
  if (!Number.isFinite(duration) || duration <= 0) {
    return "0ms";
  }
  if (duration < 1e3) {
    return `${Math.round(duration)}ms`;
  }
  const totalSeconds = Math.round(duration / 1e3);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const parts = [];
  if (hours) {
    parts.push(`${hours}h`);
  }
  if (minutes) {
    parts.push(`${minutes}m`);
  }
  if (seconds || parts.length === 0) {
    parts.push(`${seconds}s`);
  }
  return parts.join(" ");
};
var formatStats = (stats) => {
  const lines = [];
  STATUS_ORDER.forEach((status) => {
    const count = stats[status] ?? 0;
    if (count > 0) {
      lines.push(`${statusIcon(status)}&#8288;&nbsp;${count}`);
    }
  });
  return lines.length ? lines.join("<br>") : "0";
};
var formatResolutions = (resolutions) => {
  if (!resolutions) {
    return "";
  }
  const lines = [
    resolutions.issues ? `Issues: ${resolutions.issues}` : "",
    resolutions.muted ? `Muted: ${resolutions.muted}` : "",
    resolutions.accepted ? `Accepted: ${resolutions.accepted}` : ""
  ].filter(Boolean);
  return lines.join("<br>");
};
var hasResolutions = (resolutions) => resolutions.issues > 0 || resolutions.muted > 0 || resolutions.accepted > 0;
var formatFlag = (value) => value > 0 ? String(value) : "0";
var renderTable = (rows, includeResolutions) => {
  const headers = [
    "&nbsp;&nbsp;&nbsp;&nbsp;",
    "Scope",
    "Duration",
    "Stats",
    ...includeResolutions ? ["Resolutions"] : [],
    "New",
    "Flaky",
    "Retry"
  ];
  const divider = headers.map(() => "---");
  const body = rows.map((row) => [
    statusPie(row.stats),
    tableCell(row.name),
    tableCell(formatDuration(row.duration)),
    formatStats(row.stats),
    ...includeResolutions ? [formatResolutions(row.resolutions)] : [],
    tableCell(formatFlag(row.flags.new)),
    tableCell(formatFlag(row.flags.flaky)),
    tableCell(formatFlag(row.flags.retry))
  ].join(" | "));
  return [`| ${headers.join(" | ")} |`, `| ${divider.join(" | ")} |`, ...body.map((row) => `| ${row} |`)].join("\n");
};
var reportHref = (report) => report.remoteHref ?? report.href;
var reportLabel = (report) => report.plugin ?? report.name;
var reportLinkKind = (report) => report.plugin?.toLowerCase() === "testops" ? "testops" : "report";
var toReportLink = (report) => {
  const href = reportHref(report);
  return href ? {
    label: reportLabel(report),
    href,
    kind: reportLinkKind(report)
  } : void 0;
};
var sortLinks = (links) => links.toSorted((left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label));
var renderLinks = (label, links) => {
  if (!links.length) {
    return void 0;
  }
  return `**${escapeHtml(label)}:** ${links.map((item) => link(item.label, item.href)).join(", ")}`;
};
var renderReportLinks = (reports) => {
  const links = sortLinks(reports.map(toReportLink).filter((item) => item !== void 0));
  const reportLinks = links.filter(({ kind }) => kind === "report");
  const testOpsLinks = links.filter(({ kind }) => kind === "testops");
  return [renderLinks("Reports", reportLinks), renderLinks("TestOps", testOpsLinks)].filter((line) => line !== void 0);
};
var pluginSummaryToStatusStats = (report) => ({
  failed: report.stats.failed ?? 0,
  broken: report.stats.broken ?? 0,
  passed: report.stats.passed ?? 0,
  skipped: report.stats.skipped ?? 0,
  unknown: report.stats.unknown ?? 0,
  total: report.stats.total ?? 0
});
var pluginSummaryToFlags = (report) => ({
  new: report.newTests?.length ?? report.stats.new ?? 0,
  flaky: report.flakyTests?.length ?? report.stats.flaky ?? 0,
  retry: report.retryTests?.length ?? report.stats.retries ?? 0
});
var pluginSummaryToResolutions = (report) => ({
  issues: report.stats.resolutions?.issues ?? 0,
  muted: report.stats.resolutions?.muted ?? 0,
  accepted: report.stats.resolutions?.accepted ?? 0
});
var renderFilteredReports = (reports) => {
  const rows = reports.map((report) => ({
    name: report.name,
    duration: report.duration,
    stats: pluginSummaryToStatusStats(report),
    flags: pluginSummaryToFlags(report),
    resolutions: pluginSummaryToResolutions(report)
  }));
  if (!rows.length) {
    return void 0;
  }
  const includeResolutions = rows.some(({ resolutions }) => resolutions && hasResolutions(resolutions));
  const links = renderReportLinks(reports);
  return ["**Filtered Reports**", renderTable(rows, includeResolutions), ...links].join("\n\n");
};
var renderArtifacts = (artifacts) => {
  if (!artifacts.length) {
    return void 0;
  }
  const rows = artifacts.map(({ name, path: path8 }) => `| ${tableCell(name)} | ${tableCell(path8)} |`);
  return [
    `<details>`,
    `<summary>Artifacts used (${artifacts.length})</summary>`,
    "",
    "| Name | Path |",
    "| --- | --- |",
    ...rows,
    "",
    "</details>"
  ].join("\n");
};
var renderReportSummaryMarkdown = (context, options = {}) => {
  const { title = "Allure Report Summary", includeArtifacts = true } = options;
  const regularReports = context.reports.filter((report) => report.filtered !== true);
  const filteredReports = context.reports.filter((report) => report.filtered === true);
  const aggregateRows = [
    {
      name: "All tests",
      duration: context.totals.duration,
      stats: context.totals.stats,
      flags: context.totals.flags,
      resolutions: context.totals.resolutions
    },
    ...context.environments.map((environment) => ({
      name: environment.name,
      duration: environment.duration,
      stats: environment.stats,
      flags: environment.flags
    }))
  ];
  const includeResolutions = hasResolutions(context.totals.resolutions);
  const sections = [
    `# ${escapeHtml(title)}`,
    renderTable(aggregateRows, includeResolutions),
    ...renderReportLinks(regularReports),
    renderFilteredReports(filteredReports),
    includeArtifacts ? renderArtifacts(context.artifacts) : void 0
  ].filter((section) => Boolean(section));
  return `${sections.join("\n\n")}
`;
};

// dist/renderer/markdown.js
function renderPrComment(data) {
  const { context, forkPr, actionVersion, commentMarker } = data;
  const sections = [renderReportSummaryMarkdown(context).trimEnd()];
  if (forkPr) {
    sections.push("_GitHub Pages previews are disabled for fork pull requests._");
  } else if (!context.reports.some((report) => report.remoteHref)) {
    sections.push("_GitHub Pages URL not available for this run._");
  }
  const version = actionVersion.trim();
  const displayVersion = version ? version.startsWith("v") ? version : `v${version}` : "unversioned";
  sections.push(`<sub>Generated by <a href="${ACTION_REPOSITORY_URL}">quokkify/allure-report-action</a> \xB7 <a href="${ACTION_REPOSITORY_URL}/releases/latest">${displayVersion}</a></sub>`, commentMarker);
  return sections.join("\n\n");
}

// dist/commands/pr-body.js
async function runPrBody(options) {
  const context = await readPrReportContext(options.reportDir, options);
  const markdown = renderPrComment({
    context,
    forkPr: options.forkPr,
    actionVersion: options.actionVersion,
    commentMarker: options.commentMarker
  });
  fs7.writeFileSync(options.outputFile, markdown, "utf8");
  console.log(`Wrote PR body to ${options.outputFile}`);
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
var fs8 = __toESM(require("node:fs"), 1);
var path7 = __toESM(require("node:path"), 1);
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
  for (const L2 of layers) {
    const s = L2.stats;
    const epicCol = pyramidMarkdownEpicColumn(L2);
    md.push(`| ${L2.label} | ${epicCol} | **${s.total}** | ${s.passed} | ${s.failed} | ${s.broken} | ${s.skipped} |`);
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
    for (const L2 of layers) {
      const pct = 100 * L2.stats.total / pyramidTotal;
      md.push(`| ${L2.label} | ${pct.toFixed(1)}% |`);
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
    const policyHref = path7.relative(path7.resolve(path7.dirname(outputMd)), path7.resolve(policyPath)).split(path7.sep).join("/");
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
    pyramidLayerTotals: Object.fromEntries(layers.map((L2) => [L2.id, L2.stats.total])),
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
  fs8.mkdirSync(path7.dirname(markdownPath), { recursive: true });
  fs8.writeFileSync(markdownPath, markdown, "utf8");
  console.log(`Wrote ${markdownPath}`);
  if (jsonPath) {
    fs8.mkdirSync(path7.dirname(jsonPath), { recursive: true });
    fs8.writeFileSync(jsonPath, JSON.stringify(json, null, 2), "utf8");
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
function getRequiredArg(args, name) {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : void 0;
  if (value === void 0 || !value.trim() || value.startsWith("--")) {
    throw new Error(`${name} is required and must not be empty`);
  }
  return value;
}
function getFlag(args, name) {
  return args.includes(name);
}
async function main() {
  const { command, args } = parseArgs(process.argv);
  try {
    switch (command) {
      case "sanitize-results": {
        sanitizeResults({
          inputDir: getRequiredArg(args, "--input"),
          outputDir: getRequiredArg(args, "--output")
        });
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
        await runPrBody({
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
