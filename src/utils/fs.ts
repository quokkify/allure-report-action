/**
 * File system utilities
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Ensures directory exists
 */
export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Reads file as UTF-8 string
 */
export function readFile(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

/**
 * Writes file as UTF-8 string
 */
export function writeFile(file: string, content: string): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, content, 'utf8');
}

/**
 * Checks if file exists
 */
export function fileExists(file: string): boolean {
  return fs.existsSync(file);
}

/**
 * Reads JSON file safely
 */
export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Writes JSON file with formatting
 */
export function writeJson<T>(file: string, data: T): void {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}
