export type ValueType = 'string' | 'integer' | 'float' | 'boolean' | 'duration';

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/;

const DURATION_MULTIPLIERS: Record<string, number> = {
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
};

export function parseDuration(raw: string): number {
  const match = DURATION_RE.exec(raw);
  if (!match) {
    throw new Error(`Invalid duration value: "${raw}"`);
  }
  const amount = Number(match[1]);
  const unit = match[2];
  return amount * DURATION_MULTIPLIERS[unit];
}

export function parseBoolean(raw: string): boolean {
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  throw new Error(`Invalid boolean value: "${raw}"`);
}

export function parseIntValue(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`Invalid integer value: "${raw}"`);
  }
  return n;
}

export function parseFloatValue(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid float value: "${raw}"`);
  }
  return n;
}

export function parseValue(raw: string): {
  type: ValueType;
  value: string | number | boolean;
} {
  // Boolean
  const lower = raw.toLowerCase();
  if (lower === 'true' || lower === 'false') {
    return { type: 'boolean', value: lower === 'true' };
  }

  // Duration
  if (DURATION_RE.test(raw)) {
    return { type: 'duration', value: parseDuration(raw) };
  }

  // Float (contains a dot)
  if (/^-?\d+\.\d+$/.test(raw)) {
    return { type: 'float', value: parseFloatValue(raw) };
  }

  // Integer
  if (/^-?\d+$/.test(raw)) {
    return { type: 'integer', value: parseIntValue(raw) };
  }

  // String (strip surrounding quotes if present)
  let str = raw;
  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1);
  }
  return { type: 'string', value: str };
}
