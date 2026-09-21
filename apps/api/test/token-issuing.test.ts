import { describe, expect, it, vi } from 'vitest';
import { hashApiToken } from '../src/auth/token.js';
import { issueApiToken } from '../src/auth/issue-token.js';

const pepper = 'token-issuing-test-pepper';

describe('issueApiToken', () => {
  it('stores only a hash and returns the raw token once to the caller', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'token-1' });

    const issued = await issueApiToken({
      name: 'hermes',
      scopes: ['today:read', 'nutrition:write'],
      pepper,
      repository: { create },
    });

    expect(issued.rawToken).toMatch(/^qndh_[A-Za-z0-9_-]+$/);
    expect(issued.id).toBe('token-1');
    expect(create).toHaveBeenCalledWith({
      name: 'hermes',
      tokenHash: hashApiToken(issued.rawToken, pepper),
      scopes: ['today:read', 'nutrition:write'],
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(issued.rawToken);
  });

  it('rejects unknown scopes before writing anything', async () => {
    const create = vi.fn();
    await expect(issueApiToken({
      name: 'bad-token',
      scopes: ['today:read', 'admin:everything'] as any,
      pepper,
      repository: { create },
    })).rejects.toThrow(/Unknown API scope/);
    expect(create).not.toHaveBeenCalled();
  });
});
