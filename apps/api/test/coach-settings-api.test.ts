import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { RequestAuthorizer } from '../src/auth/service.js';
import type { CoachConversationRecord, CoachMessageRecord, CoachRepository, NewCoachMessage } from '../src/coach/repository.js';
import { registerCoachRoutes } from '../src/coach/routes.js';
import { registerCoachSettingsRoutes } from '../src/coach/settings-routes.js';
import { CoachSettingsAwareProvider } from '../src/coach/settings-provider.js';
import type { CoachSettingsRepository } from '../src/coach/settings.js';
import type { DeepSeekTurnInput } from '../src/coach/deepseek.js';
import { COACH_SYSTEM_PROMPT } from '../src/coach/system-prompt.js';

function memoryCoachRepository(): CoachRepository {
  const conversations: CoachConversationRecord[] = [];
  const messages: CoachMessageRecord[] = [];
  let seq = 0;
  return {
    async createConversation(title = null) {
      const now = new Date().toISOString();
      const row = { id: `c${++seq}`, title, createdAt: now, updatedAt: now };
      conversations.push(row);
      return row;
    },
    async listConversations() { return conversations; },
    async findConversation(id) { return conversations.find(row => row.id === id) ?? null; },
    async listMessages(conversationId) { return messages.filter(row => row.conversationId === conversationId); },
    async addMessage(input: NewCoachMessage) {
      const row: CoachMessageRecord = {
        id: `m${++seq}`,
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        model: input.model ?? null,
        toolMetadata: input.toolMetadata ?? null,
        createdAt: new Date().toISOString(),
      };
      messages.push(row);
      return row;
    },
  };
}

const authorizer: RequestAuthorizer = {
  async authorize(_authorization, requiredScopes) {
    return { tokenId: 'web-session', scopes: requiredScopes };
  },
};

function memorySettingsRepository() {
  let override: string | null = null;
  const repository: CoachSettingsRepository = {
    async getSystemPromptOverride() { return override; },
    async setSystemPromptOverride(value) { override = value; },
  };
  return repository;
}

describe('Coach settings API', () => {
  it('reads, edits and resets the main system prompt and uses the override on the next turn', async () => {
    const app = Fastify();
    const coachRepository = memoryCoachRepository();
    const coachSettingsRepository = memorySettingsRepository();
    const providerInputs: DeepSeekTurnInput[] = [];
    const provider = new CoachSettingsAwareProvider({
      async completeTurn(input: DeepSeekTurnInput) {
        providerInputs.push(input);
        return { content: 'Gotowe.', toolCalls: [] };
      },
    }, coachSettingsRepository);

    registerCoachSettingsRoutes(app, { authorizer, coachSettingsRepository });
    registerCoachRoutes(app, {
      authorizer,
      coachRepository,
      deepseekClient: provider,
      coachModel: 'deepseek-flash',
      timeZone: 'Europe/Warsaw',
    });

    const initial = await app.inject({ method: 'GET', url: '/api/v1/coach/settings', headers: { authorization: 'Bearer web' } });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toEqual({ systemPrompt: COACH_SYSTEM_PROMPT, isDefault: true });

    const customPrompt = 'Jesteś moim konkretnym trenerem. Odpowiadaj krótko i po polsku.';
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/coach/settings',
      headers: { authorization: 'Bearer web' },
      payload: { systemPrompt: customPrompt },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toEqual({ systemPrompt: customPrompt, isDefault: false });

    const conversation = await coachRepository.createConversation('Test');
    const turn = await app.inject({
      method: 'POST',
      url: `/api/v1/coach/conversations/${conversation.id}/messages`,
      headers: { authorization: 'Bearer web' },
      payload: { content: 'Jak dziś trenować?' },
    });
    expect(turn.statusCode).toBe(200);
    expect(providerInputs[0]?.messages[0]).toEqual({ role: 'system', content: customPrompt });

    const reset = await app.inject({
      method: 'PATCH',
      url: '/api/v1/coach/settings',
      headers: { authorization: 'Bearer web' },
      payload: { systemPrompt: null },
    });
    expect(reset.statusCode).toBe(200);
    expect(reset.json()).toEqual({ systemPrompt: COACH_SYSTEM_PROMPT, isDefault: true });

    await app.close();
  });

  it('rejects an empty custom prompt', async () => {
    const app = Fastify();
    registerCoachSettingsRoutes(app, {
      authorizer,
      coachSettingsRepository: memorySettingsRepository(),
    });

    const response = await app.inject({
      method: 'PATCH',
      url: '/api/v1/coach/settings',
      headers: { authorization: 'Bearer web' },
      payload: { systemPrompt: '   ' },
    });
    expect(response.statusCode).toBe(422);
    await app.close();
  });
});
