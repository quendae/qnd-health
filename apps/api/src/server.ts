import 'dotenv/config';
import { loadConfig } from './config.js';
import { createPrismaClient, ensureDatabaseDirectory } from './persistence/prisma-client.js';
import { buildRuntimeApp } from './runtime.js';
import { registerWebFrontend } from './web/static.js';

const config = loadConfig();
await ensureDatabaseDirectory(config.databaseUrl);
const prisma = createPrismaClient(config.databaseUrl);
const app = buildRuntimeApp({
  prisma,
  tokenPepper: config.tokenPepper,
  webUsername: config.webUsername,
  webPassword: config.webPassword,
  timeZone: config.timeZone,
  deepseekApiKey: config.deepseekApiKey,
  deepseekBaseUrl: config.deepseekBaseUrl,
  deepseekModel: config.deepseekModel,
});

await registerWebFrontend(app, config.webDistPath);

app.addHook('onClose', async () => {
  await prisma.$disconnect();
});

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
}
