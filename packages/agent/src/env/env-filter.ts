/**
 * @attractor/agent — Environment Variable Filter
 *
 * Filters out sensitive environment variables (API keys, tokens, secrets)
 * while preserving essential system variables needed for process execution.
 */

const SENSITIVE_PATTERNS = [
  // Suffix patterns
  /_API_KEY$/i,
  /_SECRET$/i,
  /_TOKEN$/i,
  /_PASSWORD$/i,
  /_CREDENTIAL$/i,
  /_KEY$/i,
  /_PRIVATE_KEY$/i,
  // Exact matches
  /^API_KEY$/i,
  /^SECRET$/i,
  /^TOKEN$/i,
  /^PASSWORD$/i,
  /^CREDENTIAL$/i,
  // Contains patterns for common sensitive vars
  /SECRET/i,
  /PASSWORD/i,
  /PRIVATE.?KEY/i,
  /ACCESS.?KEY/i,
  /AUTH/i,
  /BEARER/i,
  /SESSION/i,
  /COOKIE/i,
  // Connection strings that often embed credentials
  /^DATABASE_URL$/i,
  /^REDIS_URL$/i,
  /^MONGO_URI$/i,
  /^MONGODB_URI$/i,
  /^DSN$/i,
  /CONNECTION_STRING/i,
  // AWS-specific
  /^AWS_SECRET_ACCESS_KEY$/i,
  /^AWS_SESSION_TOKEN$/i,
  // Provider API keys (explicit)
  /^OPENAI_API_KEY$/i,
  /^ANTHROPIC_API_KEY$/i,
  /^GEMINI_API_KEY$/i,
  /^GITHUB_TOKEN$/i,
  /^NPM_TOKEN$/i,
  /^SLACK_TOKEN$/i,
  /^DISCORD_TOKEN$/i,
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
