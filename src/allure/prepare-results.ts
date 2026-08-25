/**
 * Prepare results - merges source allure-results with provenance tracking
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { AllureResult } from '../config/types.js';

const SOURCE_SCAN_SKIP_DIRECTORIES = new Set([
  '.git',
  '.gradle',
  '.idea',
  '.venv',
  'allure-report',
  'dist',
  'node_modules',
  'venv',
]);
const MAX_SOURCE_FILES = 100_000;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 256 * 1024 * 1024;
const MAX_FRAGMENT_BYTES = 1024 * 1024;
const MAX_FRAGMENT_VARIABLES = 10_000;
const MAX_FRAGMENT_VARIABLE_BYTES = 4 * 1024 * 1024;
const MAX_PRESERVED_METADATA_BYTES = 16 * 1024 * 1024;
const PRESERVED_DESTINATION_METADATA = ['environment.properties', 'executor.json'];
const MODULE_VARIABLES_METADATA = '.allure-module-variables.json';

interface ParsedFragment {
  moduleName: string;
  variables: Map<string, string>;
}

interface StagedFile {
  digest: string;
  source: string;
}

/**
 * Parses a ci-env-fragment.properties file
 */
function parseModuleFragment(fragmentPath: string): ParsedFragment {
  const stat = fs.lstatSync(fragmentPath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`Module provenance must be a regular file: ${fragmentPath}`);
  }
  if (stat.size > MAX_FRAGMENT_BYTES) {
    throw new Error(`Module provenance exceeds ${MAX_FRAGMENT_BYTES} bytes: ${fragmentPath}`);
  }
  const modules = new Set<string>();
  const variables = new Map<string, string>();
  for (const rawLine of fs.readFileSync(fragmentPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (
      !key ||
      key === '__proto__' ||
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
    if ((key === 'Module' || key.endsWith('.Module')) && value) modules.add(value);
  }
  if (modules.size !== 1) {
    const detail = modules.size === 0 ? 'none' : [...modules].sort().join(', ');
    throw new Error(`Expected exactly one module value in ${fragmentPath}; found ${detail}`);
  }
  const moduleArray = [...modules];
  return { moduleName: moduleArray[0]!, variables };
}

/**
 * Finds source allure-results directories
 */
function findSourceResultDirectories(sourceRoot: string, resultsDir: string): string[] {
  const root = path.resolve(sourceRoot);
  const destination = path.resolve(resultsDir);
  if (!fs.existsSync(root)) throw new Error(`Source artifacts directory not found: ${sourceRoot}`);
  const rootStat = fs.lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw new Error(`Source artifacts path must be a regular directory: ${sourceRoot}`);
  }

  const sources: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const directory = stack.pop()!;
    if (directory === destination) continue;
    if (path.basename(directory) === 'allure-results') {
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

/**
 * SHA-256 hash of buffer
 */
function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Creates attributed result buffer with module label
 */
function attributedResultBuffer(file: string, moduleName: string, moduleLabel: string): Buffer {
  let document: AllureResult;
  try {
    document = JSON.parse(fs.readFileSync(file, 'utf8')) as AllureResult;
  } catch (error) {
    throw new Error(`Malformed Allure result JSON ${file}: ${(error as Error).message}`);
  }
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new Error(`Allure result must be a JSON object: ${file}`);
  }
  if (document.labels !== undefined && !Array.isArray(document.labels)) {
    throw new Error(`Allure result labels must be an array: ${file}`);
  }
  const labels = (document.labels || []).filter(label => !label || label.name !== moduleLabel);
  labels.push({ name: moduleLabel, value: moduleName });
  document.labels = labels;
  return Buffer.from(`${JSON.stringify(document)}\n`, 'utf8');
}

export interface PrepareResultsOptions {
  sourceRoot: string;
  resultsDir: string;
  moduleLabel: string;
  autoMode: boolean;
}

/**
 * Prepares attributed results from source directories
 */
export function prepareAttributedResults(options: PrepareResultsOptions): void {
  const { sourceRoot, resultsDir, moduleLabel, autoMode } = options;

  if (!sourceRoot.trim()) throw new Error('--source-root must not be empty');
  if (!moduleLabel.trim()) throw new Error('--module-label must not be empty in attributed mode');

  const destination = path.resolve(resultsDir);
  const parent = path.dirname(destination);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, `.${path.basename(destination)}-prepare-`));
  const backup = path.join(
    parent,
    `.${path.basename(destination)}-backup-${process.pid}-${Date.now()}`
  );
  let destinationMoved = false;
  let sourceDirectories = 0;
  let sourceFiles = 0;
  let sourceBytes = 0;
  let attributedResults = 0;
  let fragmentVariableBytes = 0;
  const staged = new Map<string, StagedFile>();
  const fragmentVariables = new Map<string, string>();

  const stage = (name: string, data: Buffer, mode: number, source: string): void => {
    const digest = sha256(data);
    const previous = staged.get(name);
    if (previous) {
      if (previous.digest === digest) return;
      throw new Error(`Conflicting source files named ${name}: ${previous.source} and ${source}`);
    }
    fs.writeFileSync(path.join(temporary, name), data, { flag: 'wx', mode });
    staged.set(name, { digest, source });
  };

  try {
    const sourceDirectoriesFound = findSourceResultDirectories(sourceRoot, resultsDir);
    const withProvenance = sourceDirectoriesFound.filter(directory =>
      fs.existsSync(path.join(directory, 'ci-env-fragment.properties'))
    );

    if (autoMode && withProvenance.length === 0) {
      fs.rmSync(temporary, { recursive: true, force: true });
      console.log('No attributed source results detected; preserved legacy merged results');
      return;
    }
    if (sourceDirectoriesFound.length === 0) {
      throw new Error(`No source allure-results directories found under ${sourceRoot}`);
    }
    if (withProvenance.length !== sourceDirectoriesFound.length) {
      throw new Error(
        `Partial module provenance: ${withProvenance.length} of ${sourceDirectoriesFound.length} source directories contain ci-env-fragment.properties`
      );
    }

    // Preserve destination metadata
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
            `Preserved metadata exceeds ${MAX_PRESERVED_METADATA_BYTES} bytes: ${file}`
          );
        }
        stage(name, fs.readFileSync(file), stat.mode & 0o777, file);
      }
    }

    // Process each source directory
    for (const directory of sourceDirectoriesFound) {
      sourceDirectories += 1;
      const fragment = path.join(directory, 'ci-env-fragment.properties');
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
            throw new Error('Module environment variables exceed count or byte limits');
          }
          fragmentVariables.set(key, value);
        }
      }
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isSymbolicLink() || !entry.isFile()) {
          throw new Error(`Only regular files are allowed in source results: ${file}`);
        }
        if (entry.name === 'ci-env-fragment.properties') continue;
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
            `Source results exceed limits (${MAX_SOURCE_FILES} files / ${MAX_SOURCE_BYTES} bytes)`
          );
        }
        const data = entry.name.endsWith('-result.json')
          ? attributedResultBuffer(file, moduleName, moduleLabel)
          : fs.readFileSync(file);
        if (entry.name.endsWith('-result.json')) attributedResults += 1;
        stage(entry.name, data, stat.mode & 0o777, file);
      }
    }

    if (attributedResults === 0)
      throw new Error('No Allure result JSON files found in source artifacts');

    // Write module variables metadata
    const environmentMetadata = Buffer.from(
      JSON.stringify(
        Object.fromEntries(
          [...fragmentVariables].sort(([left], [right]) => left.localeCompare(right))
        )
      ),
      'utf8'
    );
    if (environmentMetadata.length > MAX_FRAGMENT_VARIABLE_BYTES) {
      throw new Error('Module environment metadata exceeds byte limit');
    }
    stage(MODULE_VARIABLES_METADATA, environmentMetadata, 0o600, 'source fragments');

    // Atomic replace
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

  console.log(
    `Prepared ${attributedResults} attributed result(s) from ${sourceDirectories} source directories (${sourceFiles} files)`
  );
}
