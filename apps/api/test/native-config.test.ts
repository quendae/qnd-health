import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findProjectRoot, loadConfig } from '../src/config.js';

describe('native Synology configuration', () => {
  it('defaults to loopback and a project-root SQLite database file', () => {
    const config = loadConfig({ TOKEN_PEPPER: 'test-pepper' });
    const expectedDatabaseUrl = `file:${resolve(findProjectRoot(), 'data/qnd-health.db').replace(/\\/g, '/')}`;

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.databaseUrl).toBe(expectedDatabaseUrl);
    expect(config.timeZone).toBe('Europe/Warsaw');
    expect(config.webDistPath.replace(/\\/g, '/')).toMatch(/\/apps\/web\/dist$/);
  });

  it('normalizes relative SQLite overrides against the project root', () => {
    const config = loadConfig({
      TOKEN_PEPPER: 'test-pepper',
      DATABASE_URL: 'file:./data/custom.db',
    });

    expect(config.databaseUrl).toBe(`file:${resolve(findProjectRoot(), 'data/custom.db').replace(/\\/g, '/')}`);
  });

  it('allows explicit absolute overrides for alternate installs', () => {
    const config = loadConfig({
      TOKEN_PEPPER: 'test-pepper',
      HOST: '0.0.0.0',
      PORT: '3100',
      DATABASE_URL: 'file:/volume2/private/qnd-health.db',
      TIME_ZONE: 'Europe/Berlin',
    });

    expect(config.host).toBe('0.0.0.0');
    expect(config.port).toBe(3100);
    expect(config.databaseUrl).toBe('file:/volume2/private/qnd-health.db');
    expect(config.timeZone).toBe('Europe/Berlin');
  });
});
