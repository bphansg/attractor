/**
 * @attractor/agent — Environment Variable Filter
 *
 * Filters out sensitive environment variables (API keys, tokens, secrets)
 * while preserving essential system variables needed for process execution.
 */

const SENSITIVE_PATTERNS = [
  /_API_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_CREDENTIAL$/i,
  /^API_KEY$/i,
  /^SECRET$/i,
  /^TOKEN$/i,
  /^PASSWORD$/i,
  /^CREDENTIAL$/i,
];

const ALWAYS_INCLUDE = new Set([
  'PATH',
  'HOME',
  'USER',
  'SHELL',
  'LANG',
  'TERM',
  'TMPDIR',
]);

/**
 * Filter environment variables, removing sensitive entries while keeping
 * essential system variables.
 */
export function filterEnvironmentVariables(
  env: Record<string, string | undefined>,
): Record<string, string> {
  const filtered: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) continue;

    if (ALWAYS_INCLUDE.has(key)) {
      filtered[key] = value;
      continue;
    }

    const isSensitive = SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
    if (!isSensitive) {
      filtered[key] = value;
    }
  }

  return filtered;
}
