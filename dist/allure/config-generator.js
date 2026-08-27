/**
 * Module config generator - creates Allure config with module-scoped environments
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getLabelValue, listResultFiles, readJsonSafe } from './parser.js';
const MODULE_VARIABLES_METADATA = '.allure-module-variables.json';
const MAX_FRAGMENT_VARIABLES = 10_000;
const MAX_FRAGMENT_VARIABLE_BYTES = 4 * 1024 * 1024;
function normalizeModuleTokens(value) {
    return String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter(token => token && token !== 'utils');
}
function parseVariableParts(key) {
    const index = key.lastIndexOf('.');
    if (index <= 0 || index === key.length - 1)
        return null;
    const prefix = key.slice(0, index).trim();
    if (!prefix)
        return null;
    return {
        prefix,
        moduleTokens: normalizeModuleTokens(prefix),
        name: key.slice(index + 1).trim(),
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
    const base = String(value || '')
        .normalize('NFKD')
        .toLowerCase()
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 52) || 'module';
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
    const metadata = path.join(resultsDir, MODULE_VARIABLES_METADATA);
    if (!fs.existsSync(metadata))
        return {};
    const stat = fs.lstatSync(metadata);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_FRAGMENT_VARIABLE_BYTES) {
        throw new Error(`Invalid module environment metadata: ${metadata}`);
    }
    let document;
    try {
        document = JSON.parse(fs.readFileSync(metadata, 'utf8'));
    }
    catch {
        throw new Error(`Malformed module environment metadata: ${metadata}`);
    }
    if (!document || typeof document !== 'object' || Array.isArray(document)) {
        throw new Error(`Invalid module environment metadata: ${metadata}`);
    }
    const entries = Object.entries(document);
    if (entries.length > MAX_FRAGMENT_VARIABLES ||
        entries.some(([key, value]) => !key ||
            key === '__proto__' ||
            key.length > 512 ||
            typeof value !== 'string' ||
            value.length > 8192 ||
            /[\u0000-\u001f\u007f]/.test(key) ||
            /[\u0000-\u001f\u007f]/.test(value))) {
        throw new Error(`Invalid module environment metadata: ${metadata}`);
    }
    return document;
}
/**
 * Generates module-scoped Allure configuration
 */
export async function generateModuleConfig(options) {
    const { resultsDir, configFile, outputFile, moduleLabel } = options;
    if (!moduleLabel.trim()) {
        throw new Error('--module-label must not be empty');
    }
    const configPath = path.resolve(configFile);
    if (!fs.existsSync(configPath)) {
        throw new Error(`Allure config not found: ${configFile}`);
    }
    // Collect module names from results
    const moduleNames = new Set();
    let unmatchedResults = 0;
    for (const file of listResultFiles(resultsDir)) {
        const doc = readJsonSafe(file);
        const moduleName = getLabelValue(doc?.labels, moduleLabel);
        if (moduleName)
            moduleNames.add(moduleName);
        else
            unmatchedResults += 1;
    }
    // Load base config
    const configUrl = pathToFileURL(configPath).href;
    const baseConfigModule = await import(configUrl);
    const baseConfig = baseConfigModule.default || {};
    // Merge all variables
    const allVariables = { ...(baseConfig.variables || {}) };
    const environments = (baseConfig.environments || {});
    for (const descriptor of Object.values(environments)) {
        Object.assign(allVariables, descriptor?.variables || {});
    }
    Object.assign(allVariables, readModuleVariables(resultsDir));
    // Also check for module variables in labels
    if (moduleNames.size > 0) {
        for (const [key, value] of Object.entries(allVariables)) {
            if (key.toLowerCase().endsWith('.module') && String(value || '').trim()) {
                moduleNames.add(String(value).trim());
            }
        }
    }
    const names = [...moduleNames].sort((a, b) => a.localeCompare(b));
    // If no modules found, preserve base config
    if (names.length === 0) {
        const source = `import baseConfig from ${JSON.stringify(configUrl)};\nexport default baseConfig;\n`;
        fs.mkdirSync(path.dirname(outputFile), { recursive: true });
        fs.writeFileSync(outputFile, source, 'utf8');
        console.log(`No ${moduleLabel} labels found; preserved caller environments in ${outputFile}`);
        return;
    }
    // Create module info
    const usedIds = new Set(['default']);
    const modules = names.map(name => ({
        id: generateEnvironmentId(name, usedIds),
        name,
        tokens: normalizeModuleTokens(name),
        variables: {},
    }));
    const modulesByName = new Map(modules.map(m => [m.name, m]));
    // Map variable prefixes to modules
    const modulesByVariablePrefix = new Map();
    for (const [key, value] of Object.entries(allVariables)) {
        const parts = parseVariableParts(key);
        if (!parts || parts.name.toLowerCase() !== 'module')
            continue;
        const module = modulesByName.get(String(value || '').trim());
        if (!module)
            continue;
        const previous = modulesByVariablePrefix.get(parts.prefix);
        if (previous && previous !== module) {
            throw new Error(`Conflicting module declarations for variable prefix ${parts.prefix}`);
        }
        modulesByVariablePrefix.set(parts.prefix, module);
    }
    // Distribute variables
    const globalVariables = {};
    for (const [key, value] of Object.entries(allVariables)) {
        const parts = parseVariableParts(key);
        const declaredModule = parts ? modulesByVariablePrefix.get(parts.prefix) : null;
        const exactMatches = parts && !declaredModule
            ? modules.filter(candidate => tokensEqual(candidate.tokens, parts.moduleTokens))
            : [];
        const suffixMatches = parts && !declaredModule && exactMatches.length === 0
            ? modules.filter(candidate => tokensEndWith(candidate.tokens, parts.moduleTokens) ||
                tokensEndWith(parts.moduleTokens, candidate.tokens))
            : [];
        const matches = exactMatches.length > 0 ? exactMatches : suffixMatches;
        const module = declaredModule || (matches.length === 1 ? matches[0] : null);
        if (module && parts?.name)
            module.variables[parts.name] = String(value);
        else
            globalVariables[key] = String(value);
    }
    // Generate config
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
    fs.writeFileSync(outputFile, source, 'utf8');
    console.log(`Prepared ${modules.length} module environment(s) from ${moduleLabel}; ${unmatchedResults} result(s) use default environment.`);
}
//# sourceMappingURL=config-generator.js.map