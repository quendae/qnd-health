import 'dotenv/config';
import { loadConfig } from '../config.js';
import { createPrismaClient, ensureDatabaseDirectory } from '../persistence/prisma-client.js';
import { createPrismaRepositories } from '../persistence/prisma-repositories.js';
import { createPrismaGoalRevisionRepository } from '../profile/prisma-goal-repository.js';
import { backfillProfileGoals } from '../profile/backfill-goals.js';

const config = loadConfig();
await ensureDatabaseDirectory(config.databaseUrl);
const prisma = createPrismaClient(config.databaseUrl);

try {
  const { profileRepository } = createPrismaRepositories(prisma);
  const revisions = createPrismaGoalRevisionRepository(prisma);
  const result = await backfillProfileGoals(revisions, profileRepository);
  console.log(`Profile goal backfill: ${result}`);
} finally {
  await prisma.$disconnect();
}
