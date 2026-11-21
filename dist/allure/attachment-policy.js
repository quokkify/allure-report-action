/**
 * Passive-attachment policy.
 *
 * The generated report is served from a shared GitHub Pages origin, where the file extension of
 * each attachment decides its Content-Type. Allure keeps the source file extension and, for an
 * extensionless source, derives one from the declared type (or by sniffing the content), so an
 * attachment can otherwise land in the report as `.html` or `.svg` and run script on that origin.
 * Instead of detecting bad content, only allowlisted passive extensions and declared types survive;
 * everything else is kept as downloadable plain text.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
const PLAIN_TEXT_TYPE = 'text/plain';
const PLAIN_TEXT_EXTENSION = '.txt';
/** Extensions that GitHub Pages serves with a Content-Type a browser never executes as a document. */
const PASSIVE_EXTENSIONS = new Set([
    '.txt',
    '.log',
    '.csv',
    '.tsv',
    '.json',
    '.yaml',
    '.yml',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.bmp',
    '.webp',
    '.tif',
    '.tiff',
    '.mp4',
    '.webm',
    '.ogv',
    '.ogg',
    '.zip',
    '.gz',
    '.tgz',
    '.tar',
    '.bz2',
    '.imagediff',
]);
/**
 * Declared types the Allure viewer renders as text, code, raster image, video, table, JSON-backed
 * widget, or download, mapped to the extension an extensionless source of that type receives.
 * HTML, SVG, Markdown, Mermaid, and URI lists are rendered as markup or links and are excluded.
 */
const PASSIVE_TYPES = new Map([
    [PLAIN_TEXT_TYPE, PLAIN_TEXT_EXTENSION],
    ['text/csv', '.csv'],
    ['text/tab-separated-values', '.tsv'],
    ['application/json', '.json'],
    ['text/json', '.json'],
    ['application/vnd.allure.image.diff', '.imagediff'],
    ['application/vnd.allure.http+json', '.json'],
    ['image/png', '.png'],
    ['image/jpeg', '.jpg'],
    ['image/jpg', '.jpg'],
    ['image/gif', '.gif'],
    ['image/bmp', '.bmp'],
    ['image/webp', '.webp'],
    ['image/tiff', '.tiff'],
    ['video/mp4', '.mp4'],
    ['video/webm', '.webm'],
    ['video/ogg', '.ogv'],
    ['application/zip', '.zip'],
    ['application/gzip', '.gz'],
    ['application/x-tar', '.tar'],
    ['application/x-gtar', '.tar'],
    ['application/x-bzip2', '.bz2'],
    ['application/vnd.allure.playwright-trace', '.zip'],
    ...[
        'text/xml',
        'application/xml',
        'text/yaml',
        'text/x-yaml',
        'application/yaml',
        'application/x-yaml',
        'text/css',
        'text/javascript',
        'text/typescript',
        'text/sql',
        'text/java',
        'text/kotlin',
        'text/python',
    ].map((type) => [type, PLAIN_TEXT_EXTENSION]),
]);
const RESULT_DOCUMENT_SUFFIXES = ['-result.json', '-container.json', '-globals.json'];
const WITHHELD_ATTACHMENT_TEXT = 'This attachment was withheld by quokkify/allure-report-action because its file type could run script in a browser.\n';
function normalizeType(type) {
    if (typeof type !== 'string')
        return undefined;
    return type.split(';')[0].trim().toLowerCase();
}
function isSafeName(name) {
    return (name !== '' &&
        name === path.basename(name) &&
        name !== '.' &&
        name !== '..' &&
        !name.includes('\\') &&
        !name.includes('\0'));
}
function collectReferences(document) {
    const references = [];
    const stack = [document];
    while (stack.length > 0) {
        const node = stack.pop();
        if (!node || typeof node !== 'object')
            continue;
        if (Array.isArray(node)) {
            stack.push(...node);
            continue;
        }
        const attachments = node.attachments;
        if (Array.isArray(attachments)) {
            for (const attachment of attachments) {
                if (attachment &&
                    typeof attachment === 'object' &&
                    !Array.isArray(attachment) &&
                    typeof attachment.source === 'string') {
                    references.push(attachment);
                }
            }
        }
        stack.push(...Object.values(node));
    }
    return references;
}
/** Published name for a source given the (already neutralised) declared type. */
function passiveName(source, type) {
    const extension = path.extname(source).toLowerCase();
    if (extension === '')
        return `${source}${(type && PASSIVE_TYPES.get(type)) ?? PLAIN_TEXT_EXTENSION}`;
    return PASSIVE_EXTENSIONS.has(extension) ? source : `${source}${PLAIN_TEXT_EXTENSION}`;
}
/**
 * Rewrites Allure 2 result, container, and globals documents in `resultsDir` so every referenced
 * attachment has a passive declared type and a passive file extension. Non-passive types become
 * `text/plain`; non-passive or missing extensions are fixed by appending one and renaming the file.
 */
export function neutralizeAttachments(resultsDir) {
    const documents = [];
    for (const entry of fs.readdirSync(resultsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !RESULT_DOCUMENT_SUFFIXES.some(suffix => entry.name.endsWith(suffix))) {
            continue;
        }
        const file = path.join(resultsDir, entry.name);
        let document;
        try {
            document = JSON.parse(fs.readFileSync(file, 'utf8'));
        }
        catch {
            // Allure cannot read a malformed document either, so it contributes no attachments.
            continue;
        }
        documents.push({ file, document, references: collectReferences(document) });
    }
    let retyped = 0;
    const dirty = new Set();
    const targets = new Map();
    for (const { file, references } of documents) {
        for (const reference of references) {
            const declared = normalizeType(reference.type);
            const untypedExtensionless = reference.type === undefined && path.extname(reference.source) === '';
            if (untypedExtensionless ||
                (reference.type !== undefined && !PASSIVE_TYPES.has(declared ?? ''))) {
                reference.type = PLAIN_TEXT_TYPE;
                retyped += 1;
                dirty.add(file);
            }
            const target = passiveName(reference.source, normalizeType(reference.type));
            targets.set(reference.source, (targets.get(reference.source) ?? new Set()).add(target));
        }
    }
    const renames = new Map();
    for (const [source, candidates] of targets) {
        const target = candidates.size === 1 ? [...candidates][0] : `${source}${PLAIN_TEXT_EXTENSION}`;
        if (target === source || !isSafeName(source))
            continue;
        const from = path.join(resultsDir, source);
        if (!fs.existsSync(from) || !fs.lstatSync(from).isFile())
            continue;
        // Never overwrite: pick the first free `<name>.<n><ext>` when the passive name is taken.
        const extension = path.extname(target);
        let free = target;
        for (let n = 1; fs.existsSync(path.join(resultsDir, free)); n += 1) {
            free = `${target.slice(0, -extension.length)}.${n}${extension}`;
        }
        fs.renameSync(from, path.join(resultsDir, free));
        renames.set(source, free);
    }
    for (const { file, document, references } of documents) {
        for (const reference of references) {
            const target = renames.get(reference.source);
            if (target === undefined)
                continue;
            reference.source = target;
            dirty.add(file);
        }
        if (dirty.has(file))
            fs.writeFileSync(file, `${JSON.stringify(document)}\n`);
    }
    return { renamed: renames.size, retyped };
}
/**
 * Replaces any file under a generated report's `data/attachments` directories whose extension is
 * not passive with an inert notice. Covers attachments Allure creates from inputs other than
 * Allure 2 results (for example Cucumber JSON embeddings), which the pre-generation pass cannot see.
 */
export function neutralizeReportAttachments(reportDir) {
    let withheld = 0;
    const stack = [path.resolve(reportDir)];
    while (stack.length > 0) {
        const directory = stack.pop();
        const isAttachmentDirectory = path.basename(directory) === 'attachments' &&
            path.basename(path.dirname(directory)) === 'data';
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const child = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                stack.push(child);
            }
            else if (isAttachmentDirectory &&
                !PASSIVE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
                fs.rmSync(child, { force: true });
                fs.writeFileSync(child, WITHHELD_ATTACHMENT_TEXT);
                withheld += 1;
            }
        }
    }
    return withheld;
}
//# sourceMappingURL=attachment-policy.js.map