/**
 * Crypto utilities
 */
import { createHash } from 'node:crypto';
/**
 * Computes SHA-256 hash of a string
 */
export function sha256(input) {
    return createHash('sha256').update(input).digest('hex');
}
/**
 * Computes SHA-256 hash of a buffer
 */
export function sha256Buffer(buffer) {
    return createHash('sha256').update(buffer).digest('hex');
}
//# sourceMappingURL=crypto.js.map