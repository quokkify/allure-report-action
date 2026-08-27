/**
 * Ensures directory exists
 */
export declare function ensureDir(dir: string): void;
/**
 * Reads file as UTF-8 string
 */
export declare function readFile(file: string): string;
/**
 * Writes file as UTF-8 string
 */
export declare function writeFile(file: string, content: string): void;
/**
 * Checks if file exists
 */
export declare function fileExists(file: string): boolean;
/**
 * Reads JSON file safely
 */
export declare function readJson<T>(file: string): T | null;
/**
 * Writes JSON file with formatting
 */
export declare function writeJson<T>(file: string, data: T): void;
//# sourceMappingURL=fs.d.ts.map