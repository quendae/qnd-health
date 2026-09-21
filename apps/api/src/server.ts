import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import { loadConfig } from './config.js';
import { buildRuntimeApp } from './runtime.js';

const config = loadConfig();
const adapter = new PrismaPg({ connectionString: config.databaseUrl });
const prisma = new PrismaClient({ adapter });
const app = buildRuntimeApp({
  prisma,
  tokenPepper: config.tokenPepper,
  timeZone: config.timeZone,
});

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
