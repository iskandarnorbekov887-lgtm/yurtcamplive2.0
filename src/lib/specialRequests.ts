// src/lib/specialRequests.ts
/**
 * Centralised helpers for the `special_requests` JSONB column.
 * All code should import these functions instead of performing ad‑hoc
 * JSON.parse / JSON.stringify or deleting the field.
 */

export type SpecialRequests = Record<string, unknown>;

/**
 * Safely parse a value that may be a JSON string, an object, or undefined.
 * Returns an empty object when the input is falsy.
 */
export function parseSpecialRequests(raw: unknown): SpecialRequests {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      console.warn('Failed to parse special_requests JSON string.');
      return {};
    }
  }
  // Assume it is already an object.
  return raw as SpecialRequests;
}

/**
 * Convert an object back to a JSON string only when needed.
 * Returns `undefined` if the object is empty (so the column stays NULL).
 */
export function stringifyIfObject(
  obj: SpecialRequests | undefined | null
): string | undefined {
  if (!obj || Object.keys(obj).length === 0) return undefined;
  return JSON.stringify(obj);
}
