import 'dotenv/config';
import { issueApiToken } from '../auth/issue-token.js';
import { apiScopes, type ApiScope } from '../auth/scopes.js';
import { loadConfig } from '../config.js';
import { createPrismaClient, ensureDatabaseDirectory } from '../persistence/prisma-client.js';

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const name = arg('name')?.trim();
const rawScopes = arg('scopes')?.split(',').map((scope) => scope.trim()).filter(Boolean);

if (!name || !rawScopes?.length) {
  console.error('Usage: pnpm token:create -- --name <name> --scopes <scope,scope,...>');
  console.error(`Available scopes: ${apiScopes.join(', ')}`);
  process.exit(2);
}

const config = loadConfig();
await ensureDatabaseDirectory(config.databaseUrl);
const prisma = createPrismaClient(config.databaseUrl);

try {
  const issued = await issueApiToken({
    name,
    scopes: rawScopes as ApiScope[],
    pepper: config.tokenPepper,
    repository: {
      async create(input) {
        return prisma.apiToken.create({
          data: {
            name: input.name,
            tokenHash: input.tokenHash,
            scopesJson: JSON.stringify(input.scopes),
          },
          select: { id: true },
        });
      },
    },
  });

  console.log(`Created API token "${name}" (${issued.id})`);
  console.log(`Scopes: ${issued.scopes.join(', ')}`);
  console.log('Copy this token now. It will not be shown again:');
  console.log(issued.rawToken);
} finally {
  await prisma.$disconnect();
}
