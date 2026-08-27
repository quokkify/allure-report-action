/**
 * File system utilities
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
/**
 * Ensures directory exists
 */
export function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
}
/**
 * Reads file as UTF-8 string
 */
export function readFile(file) {
    return fs.readFileSync(file, 'utf8');
}
/**
 * Writes file as UTF-8 string
 */
export function writeFile(file, content) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, content, 'utf8');
}
/**
 * Checks if file exists
 */
export function fileExists(file) {
    return fs.existsSync(file);
}
/**
 * Reads JSON file safely
 */
export function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    catch {
        return null;
    }
}
/**
 * Writes JSON file with formatting
 */
export function writeJson(file, data) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
//# sourceMappingURL=fs.js.map