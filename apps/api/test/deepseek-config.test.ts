import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('DeepSeek config', () => {
  it('uses the DeepSeek Flash defaults without requiring a key at startup', () => {
    const config = loadConfig({ TOKEN_PEPPER: 'pepper' });
    expect(config.deepseekApiKey).toBeNull();
    expect(config.deepseekBaseUrl).toBe('https://api.deepseek.com');
    expect(config.deepseekModel).toBe('deepseek-flash');
  });

  it('accepts server-side overrides', () => {
    const config = loadConfig({
      TOKEN_PEPPER: 'pepper',
      DEEPSEEK_API_KEY: 'secret',
      DEEPSEEK_BASE_URL: 'https://example.invalid/v1',
      DEEPSEEK_MODEL: 'custom-model',
    });
    expect(config.deepseekApiKey).toBe('secret');
    expect(config.deepseekBaseUrl).toBe('https://example.invalid/v1');
    expect(config.deepseekModel).toBe('custom-model');
  });
});
