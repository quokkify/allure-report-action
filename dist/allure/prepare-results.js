/**
 * Prepare results - merges source allure-results with provenance tracking
 */
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
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
const MAX_SANITIZED_FILES = 100_000;
const MAX_SANITIZED_BYTES = 2 * 1024 * 1024 * 1024;
const ACTIVE_ATTACHMENT_EXTENSIONS = new Set([
    '.cjs',
    '.htm',
    '.html',
    '.js',
    '.mjs',
    '.svg',
    '.xhtml',
]);
/**
 * Parses a ci-env-fragment.properties file
 */
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
    for (const rawLine of fs.readFileSync(fragmentPath, 'utf8').split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || !line.includes('='))
            continue;
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        if (!key ||
            key === '__proto__' ||
            key.length > 512 ||
            value.length > 8192 ||
            /[\u0000-\u001f\u007f]/.test(key) ||
            /[\u0000-\u001f\u007f]/.test(value)) {
            throw new Error(`Invalid environment variable in ${fragmentPath}`);
        }
        const previous = variables.get(key);
        if (previous !== undefined && previous !== value) {
            throw new Error(`Conflicting environment variable ${key} in ${fragmentPath}`);
        }
        variables.set(key, value);
        if ((key === 'Module' || key.endsWith('.Module')) && value)
            modules.add(value);
    }
    if (modules.size !== 1) {
        const detail = modules.size === 0 ? 'none' : [...modules].sort().join(', ');
        throw new Error(`Expected exactly one module value in ${fragmentPath}; found ${detail}`);
    }
    const moduleArray = [...modules];
    return { moduleName: moduleArray[0], variables };
}
/**
 * Finds source allure-results directories
 */
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
        if (path.basename(directory) === 'allure-results') {
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
/**
 * SHA-256 hash of buffer
 */
function sha256(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
/**
 * Creates attributed result buffer with module label
 */
function attributedResultBuffer(file, moduleName, moduleLabel) {
    let document;
    try {
        document = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch (error) {
        throw new Error(`Malformed Allure result JSON ${file}: ${error.message}`);
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
    // Ensure start/stop timestamps exist to prevent plugin-awesome duration chart errors
    const now = Date.now();
    if (typeof document.start !== 'number' || document.start <= 0) {
        document.start = now;
    }
    if (typeof document.stop !== 'number' || document.stop <= 0) {
        document.stop = document.start + 1;
    }
    return Buffer.from(`${JSON.stringify(document)}\n`, 'utf8');
}
function safeResultName(name) {
    return name === path.basename(name) && !name.includes('\\') && !name.includes('\0');
}
function rejectActiveAttachment(name, data) {
    if (ACTIVE_ATTACHMENT_EXTENSIONS.has(path.extname(name).toLowerCase())) {
        throw new Error(`Active Allure attachment is not allowed: ${name}`);
    }
    const text = data.toString('utf8', 0, Math.min(data.length, 64 * 1024)).toLowerCase();
    if (/<\s*script\b|<\s*(iframe|object|embed|svg)\b|javascript\s*:/.test(text)) {
        throw new Error(`Active content in Allure attachment is not allowed: ${name}`);
    }
}
function pathContains(parent, child) {
    const relative = path.relative(parent, child);
    return (relative === '' ||
        (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`)));
}
function collectAttachmentReferences(node, inputName, referenced) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
        throw new Error(`Malformed executable node in ${inputName}`);
    }
    const executable = node;
    if (executable.attachments !== undefined && !Array.isArray(executable.attachments)) {
        throw new Error(`Malformed attachment references: ${inputName}`);
    }
    for (const attachment of executable.attachments ?? []) {
        if (!attachment ||
            typeof attachment !== 'object' ||
            Array.isArray(attachment) ||
            typeof attachment.source !== 'string' ||
            !safeResultName(attachment.source)) {
            throw new Error(`Malformed attachment reference in ${inputName}`);
        }
        referenced.add(attachment.source);
    }
    if (executable.steps !== undefined && !Array.isArray(executable.steps)) {
        throw new Error(`Malformed executable steps in ${inputName}`);
    }
    for (const step of executable.steps ?? []) {
        collectAttachmentReferences(step, inputName, referenced);
    }
}
/** Copies only bounded, regular, passive Allure inputs across the trust boundary. */
export function sanitizeResults(options) {
    if (!options.inputDir.trim())
        throw new Error('--input must not be empty');
    if (!options.outputDir.trim())
        throw new Error('--output must not be empty');
    const input = path.resolve(options.inputDir);
    const output = path.resolve(options.outputDir);
    if (pathContains(input, output) || pathContains(output, input)) {
        throw new Error('Sanitized Allure results directory must not overlap the input directory');
    }
    const inputStat = fs.lstatSync(input);
    if (!inputStat.isDirectory() || inputStat.isSymbolicLink()) {
        throw new Error(`Allure results input must be a regular directory: ${options.inputDir}`);
    }
    const regular = new Map();
    const referenced = new Set();
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
            throw new Error('Allure result inputs exceed count or byte limits');
        }
        const data = fs.readFileSync(file);
        if (entry.name.endsWith('-result.json') || entry.name.endsWith('-container.json')) {
            let document;
            try {
                document = JSON.parse(data.toString('utf8'));
            }
            catch (error) {
                throw new Error(`Malformed Allure input JSON ${entry.name}: ${error.message}`);
            }
            if (!document || typeof document !== 'object' || Array.isArray(document)) {
                throw new Error(`Allure input must be a JSON object: ${entry.name}`);
            }
            if (entry.name.endsWith('-result.json')) {
                collectAttachmentReferences(document, entry.name, referenced);
            }
            else {
                const container = document;
                for (const property of ['befores', 'afters']) {
                    const fixtures = container[property];
                    if (fixtures !== undefined && !Array.isArray(fixtures)) {
                        throw new Error(`Malformed container ${property}: ${entry.name}`);
                    }
                    for (const fixture of fixtures ?? []) {
                        collectAttachmentReferences(fixture, entry.name, referenced);
                    }
                }
            }
        }
        regular.set(entry.name, data);
    }
    if (![...regular.keys()].some(name => name.endsWith('-result.json'))) {
        throw new Error('No Allure result JSON files found in downloaded artifact');
    }
    for (const reference of referenced) {
        if (!regular.has(reference))
            throw new Error(`Missing Allure attachment referenced by result: ${reference}`);
    }
    for (const [name, data] of regular) {
        if (referenced.has(name))
            rejectActiveAttachment(name, data);
        if (!name.endsWith('-result.json') &&
            !name.endsWith('-container.json') &&
            !name.endsWith('.json') &&
            !name.endsWith('.properties')) {
            if (!referenced.has(name))
                throw new Error(`Unreferenced Allure attachment is not allowed: ${name}`);
        }
    }
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const temporary = fs.mkdtempSync(path.join(path.dirname(output), `.${path.basename(output)}-sanitize-`));
    try {
        for (const [name, data] of regular)
            fs.writeFileSync(path.join(temporary, name), data, { flag: 'wx', mode: 0o600 });
        fs.rmSync(output, { recursive: true, force: true });
        fs.renameSync(temporary, output);
    }
    catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        throw error;
    }
}
/**
 * Prepares attributed results from source directories
 */
export function prepareAttributedResults(options) {
    const { sourceRoot, resultsDir, moduleLabel, autoMode } = options;
    if (!sourceRoot.trim())
        throw new Error('--source-root must not be empty');
    if (!moduleLabel.trim())
        throw new Error('--module-label must not be empty in attributed mode');
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
    const staged = new Map();
    const fragmentVariables = new Map();
    const stage = (name, data, mode, source) => {
        const digest = sha256(data);
        const previous = staged.get(name);
        if (previous) {
            if (previous.digest === digest)
                return;
            throw new Error(`Conflicting source files named ${name}: ${previous.source} and ${source}`);
        }
        fs.writeFileSync(path.join(temporary, name), data, { flag: 'wx', mode });
        staged.set(name, { digest, source });
    };
    try {
        const sourceDirectoriesFound = findSourceResultDirectories(sourceRoot, resultsDir);
        const withProvenance = sourceDirectoriesFound.filter(directory => fs.existsSync(path.join(directory, 'ci-env-fragment.properties')));
        if (autoMode && withProvenance.length === 0) {
            fs.rmSync(temporary, { recursive: true, force: true });
            console.log('No attributed source results detected; preserved legacy merged results');
            return;
        }
        if (sourceDirectoriesFound.length === 0) {
            throw new Error(`No source allure-results directories found under ${sourceRoot}`);
        }
        if (withProvenance.length !== sourceDirectoriesFound.length) {
            throw new Error(`Partial module provenance: ${withProvenance.length} of ${sourceDirectoriesFound.length} source directories contain ci-env-fragment.properties`);
        }
        // Preserve destination metadata
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
                    if (fragmentVariables.size >= MAX_FRAGMENT_VARIABLES ||
                        fragmentVariableBytes > MAX_FRAGMENT_VARIABLE_BYTES) {
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
                if (entry.name === 'ci-env-fragment.properties')
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
                const data = entry.name.endsWith('-result.json')
                    ? attributedResultBuffer(file, moduleName, moduleLabel)
                    : fs.readFileSync(file);
                if (entry.name.endsWith('-result.json'))
                    attributedResults += 1;
                stage(entry.name, data, stat.mode & 0o777, file);
            }
        }
        if (attributedResults === 0)
            throw new Error('No Allure result JSON files found in source artifacts');
        // Write module variables metadata
        const environmentMetadata = Buffer.from(JSON.stringify(Object.fromEntries([...fragmentVariables].sort(([left], [right]) => left.localeCompare(right)))), 'utf8');
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
        if (destinationMoved)
            fs.rmSync(backup, { recursive: true, force: true });
    }
    catch (error) {
        fs.rmSync(temporary, { recursive: true, force: true });
        if (destinationMoved && !fs.existsSync(destination) && fs.existsSync(backup)) {
            fs.renameSync(backup, destination);
        }
        throw error;
    }
    console.log(`Prepared ${attributedResults} attributed result(s) from ${sourceDirectories} source directories (${sourceFiles} files)`);
}
//# sourceMappingURL=prepare-results.js.map