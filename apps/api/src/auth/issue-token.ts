import { apiScopes, type ApiScope } from './scopes.js';
import { generateApiToken, hashApiToken } from './token.js';

export interface ApiTokenIssueRepository {
  create(input: { name: string; tokenHash: string; scopes: ApiScope[] }): Promise<{ id: string }>;
}

export interface IssueApiTokenInput {
  name: string;
  scopes: ApiScope[];
  pepper: string;
  repository: ApiTokenIssueRepository;
}

export async function issueApiToken(input: IssueApiTokenInput): Promise<{ id: string; rawToken: string; scopes: ApiScope[] }> {
  const name = input.name.trim();
  if (!name) throw new Error('Token name is required');
  if (!input.pepper) throw new Error('Token pepper is required');
  if (input.scopes.length === 0) throw new Error('At least one API scope is required');

  const allowed = new Set<string>(apiScopes);
  for (const scope of input.scopes) {
    if (!allowed.has(scope)) throw new Error(`Unknown API scope: ${scope}`);
  }

  const scopes = [...new Set(input.scopes)];
  const rawToken = generateApiToken();
  const created = await input.repository.create({
    name,
    tokenHash: hashApiToken(rawToken, input.pepper),
    scopes,
  });

  return { id: created.id, rawToken, scopes };
}
