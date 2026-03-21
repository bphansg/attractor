// @attractor/llm — Simple JSON Schema Validation
// Used for tool argument validation and structured output verification.

// ── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Validate `data` against a JSON Schema object.
 *
 * Supports a practical subset of JSON Schema:
 * - `type` (string, number, integer, boolean, object, array, null)
 * - `required` (for objects)
 * - `properties` (for objects)
 * - `additionalProperties` (boolean, for objects)
 * - `items` (for arrays)
 * - `enum`
 * - `minLength` / `maxLength` (for strings)
 * - `minimum` / `maximum` (for numbers)
 * - `minItems` / `maxItems` (for arrays)
 *
 * This is intentionally simple — not a full JSON Schema validator.
 */
export function validateJsonSchema(
  data: unknown,
  schema: Record<string, unknown>,
): ValidationResult {
  const errors: string[] = [];
  validate(data, schema, '', errors);
  return { valid: errors.length === 0, errors };
}

// ── Internal validation ──────────────────────────────────────────────────────

function validate(
  data: unknown,
  schema: Record<string, unknown>,
  path: string,
  errors: string[],
): void {
  // Enum check (applies to any type).
  if (schema['enum'] !== undefined) {
    const allowed = schema['enum'] as unknown[];
    if (!allowed.includes(data)) {
      errors.push(`${pathLabel(path)}: value ${JSON.stringify(data)} is not one of ${JSON.stringify(allowed)}`);
      return;
    }
  }

  // Type check.
  if (schema['type'] !== undefined) {
    const expectedType = schema['type'] as string;
    if (!matchesType(data, expectedType)) {
      errors.push(`${pathLabel(path)}: expected type "${expectedType}" but got ${actualType(data)}`);
      return; // No point checking further constraints if the type is wrong.
    }
  }

  // String constraints.
  if (typeof data === 'string') {
    const minLen = schema['minLength'] as number | undefined;
    const maxLen = schema['maxLength'] as number | undefined;
    if (minLen !== undefined && data.length < minLen) {
      errors.push(`${pathLabel(path)}: string length ${data.length} is less than minLength ${minLen}`);
    }
    if (maxLen !== undefined && data.length > maxLen) {
      errors.push(`${pathLabel(path)}: string length ${data.length} exceeds maxLength ${maxLen}`);
    }
  }

  // Number constraints.
  if (typeof data === 'number') {
    const min = schema['minimum'] as number | undefined;
    const max = schema['maximum'] as number | undefined;
    if (min !== undefined && data < min) {
      errors.push(`${pathLabel(path)}: value ${data} is less than minimum ${min}`);
    }
    if (max !== undefined && data > max) {
      errors.push(`${pathLabel(path)}: value ${data} exceeds maximum ${max}`);
    }
  }

  // Object constraints.
  if (isPlainObject(data)) {
    const properties = schema['properties'] as Record<string, Record<string, unknown>> | undefined;
    const required = schema['required'] as string[] | undefined;
    const additionalProperties = schema['additionalProperties'];

    // Check required fields.
    if (required) {
      for (const key of required) {
        if (!(key in data)) {
          errors.push(`${pathLabel(path)}: missing required property "${key}"`);
        }
      }
    }

    // Validate known properties.
    if (properties) {
      for (const [key, propSchema] of Object.entries(properties)) {
        if (key in data) {
          validate((data as Record<string, unknown>)[key], propSchema, joinPath(path, key), errors);
        }
      }
    }

    // Check for additional properties.
    if (additionalProperties === false && properties) {
      const knownKeys = new Set(Object.keys(properties));
      for (const key of Object.keys(data as Record<string, unknown>)) {
        if (!knownKeys.has(key)) {
          errors.push(`${pathLabel(path)}: unexpected additional property "${key}"`);
        }
      }
    }
  }

  // Array constraints.
  if (Array.isArray(data)) {
    const minItems = schema['minItems'] as number | undefined;
    const maxItems = schema['maxItems'] as number | undefined;
    const items = schema['items'] as Record<string, unknown> | undefined;

    if (minItems !== undefined && data.length < minItems) {
      errors.push(`${pathLabel(path)}: array length ${data.length} is less than minItems ${minItems}`);
    }
    if (maxItems !== undefined && data.length > maxItems) {
      errors.push(`${pathLabel(path)}: array length ${data.length} exceeds maxItems ${maxItems}`);
    }
    if (items) {
      for (let i = 0; i < data.length; i++) {
        validate(data[i], items, joinPath(path, String(i)), errors);
      }
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function matchesType(data: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'string':
      return typeof data === 'string';
    case 'number':
      return typeof data === 'number' && !Number.isNaN(data);
    case 'integer':
      return typeof data === 'number' && Number.isInteger(data);
    case 'boolean':
      return typeof data === 'boolean';
    case 'null':
      return data === null;
    case 'object':
      return isPlainObject(data);
    case 'array':
      return Array.isArray(data);
    default:
      return true; // Unknown type — be lenient.
  }
}

function actualType(data: unknown): string {
  if (data === null) return 'null';
  if (Array.isArray(data)) return 'array';
  return typeof data;
}

function isPlainObject(data: unknown): data is Record<string, unknown> {
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

function pathLabel(path: string): string {
  return path || '(root)';
}

function joinPath(base: string, key: string): string {
  if (!base) return key;
  // Use bracket notation for array indices.
  if (/^\d+$/.test(key)) return `${base}[${key}]`;
  return `${base}.${key}`;
}
