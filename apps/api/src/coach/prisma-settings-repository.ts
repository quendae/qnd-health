import type { PrismaClientPort } from '../persistence/prisma-repositories.js';
import type { CoachSettingsRepository } from './settings.js';

const SYSTEM_PROMPT_KEY = 'coach.systemPrompt';

export function createPrismaCoachSettingsRepository(prisma: PrismaClientPort): CoachSettingsRepository {
  return {
    async getSystemPromptOverride() {
      const row = await prisma.appSetting.findUnique({ where: { key: SYSTEM_PROMPT_KEY } });
      return row?.value ?? null;
    },
    async setSystemPromptOverride(value) {
      if (value === null) {
        await prisma.appSetting.deleteMany({ where: { key: SYSTEM_PROMPT_KEY } });
        return;
      }
      await prisma.appSetting.upsert({
        where: { key: SYSTEM_PROMPT_KEY },
        create: { key: SYSTEM_PROMPT_KEY, value },
        update: { value },
      });
    },
  };
}
