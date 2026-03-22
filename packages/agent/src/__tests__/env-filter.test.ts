import { describe, it, expect } from 'vitest';
import { filterEnvironmentVariables } from '../env/env-filter.js';

describe('filterEnvironmentVariables', () => {
  it('keeps essential system variables (PATH, HOME, USER, SHELL, LANG, TERM, TMPDIR)', () => {
    const env = {
      PATH: '/usr/bin',
      HOME: '/home/user',
      USER: 'user',
      SHELL: '/bin/zsh',
      LANG: 'en_US.UTF-8',
      TERM: 'xterm-256color',
      TMPDIR: '/tmp',
    };

    const result = filterEnvironmentVariables(env);

    expect(result).toEqual(env);
  });

  it('filters OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY', () => {
    const env = {
      PATH: '/usr/bin',
      OPENAI_API_KEY: 'sk-secret',
      ANTHROPIC_API_KEY: 'sk-ant-secret',
      GEMINI_API_KEY: 'gemini-secret',
    };

    const result = filterEnvironmentVariables(env);

    expect(result).toEqual({ PATH: '/usr/bin' });
    expect(result).not.toHaveProperty('OPENAI_API_KEY');
    expect(result).not.toHaveProperty('ANTHROPIC_API_KEY');
    expect(result).not.toHaveProperty('GEMINI_API_KEY');
  });

  it('filters variables containing SECRET, PASSWORD, AUTH', () => {
    const env = {
      MY_SECRET_VALUE: 'hidden',
      DB_PASSWORD: 'pass123',
      OAUTH_TOKEN: 'tok-abc',
      HOME: '/home/user',
    };

    const result = filterEnvironmentVariables(env);

    expect(result).not.toHaveProperty('MY_SECRET_VALUE');
    expect(result).not.toHaveProperty('DB_PASSWORD');
    expect(result).not.toHaveProperty('OAUTH_TOKEN');
    expect(result).toHaveProperty('HOME');
  });

  it('filters AWS_SECRET_ACCESS_KEY and DATABASE_URL', () => {
    const env = {
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
      DATABASE_URL: 'postgres://user:pass@localhost/db',
      PATH: '/usr/bin',
    };

    const result = filterEnvironmentVariables(env);

    expect(result).not.toHaveProperty('AWS_SECRET_ACCESS_KEY');
    expect(result).not.toHaveProperty('DATABASE_URL');
    expect(result).toHaveProperty('PATH');
  });

  it('keeps normal non-sensitive variables like NODE_ENV and npm_config_prefix', () => {
    const env = {
      NODE_ENV: 'production',
      npm_config_prefix: '/usr/local',
      EDITOR: 'vim',
      CI: 'true',
    };

    const result = filterEnvironmentVariables(env);

    expect(result).toEqual(env);
  });
});
