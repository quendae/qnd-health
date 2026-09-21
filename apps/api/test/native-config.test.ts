import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('native Synology configuration', () => {
  it('defaults to loopback and a local SQLite database file', () => {
    const config = loadConfig({ TOKEN_PEPPER: 'test-pepper' });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(3001);
    expect(config.databaseUrl).toBe('file:./data/qnd-health.db');
    expect(config.timeZone).toBe('Europe/Warsaw');
  });

  it('allows explicit overrides for development and alternate installs', () => {
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
