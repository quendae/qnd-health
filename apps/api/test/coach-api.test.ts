import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { RequestAuthorizer } from '../src/auth/service.js';
import type { CoachConversationRecord, CoachMessageRecord, CoachRepository, NewCoachMessage } from '../src/coach/repository.js';
import { registerCoachRoutes } from '../src/coach/routes.js';
import type { DeepSeekTurnInput, DeepSeekTurnResult } from '../src/coach/deepseek.js';
import type { AuditEventInput, AuditRepository } from '../src/audit/repository.js';
import { ProfileGoalService } from '../src/profile/goals.js';
import type { ProfileGoalRevisionRecord, ProfileGoalRevisionRepository } from '../src/profile/goal-repository.js';
import type { HealthProfileRecord, HealthProfileRepository } from '../src/profile/repository.js';

function memoryCoachRepository(): CoachRepository & { conversations: CoachConversationRecord[]; messages: CoachMessageRecord[] } {
  const conversations: CoachConversationRecord[] = [];
  const messages: CoachMessageRecord[] = [];
  let seq = 0;
  return {
    conversations, messages,
    async createConversation(title = null) {
      const now = new Date().toISOString();
      const row = { id: `c${++seq}`, title, createdAt: now, updatedAt: now };
      conversations.unshift(row);
      return row;
    },
    async listConversations() { return conversations; },
    async findConversation(id) { return conversations.find(row => row.id === id) ?? null; },
    async listMessages(conversationId) { return messages.filter(row => row.conversationId === conversationId); },
    async addMessage(input: NewCoachMessage) {
      const row: CoachMessageRecord = {
        id: `m${++seq}`, conversationId: input.conversationId, role: input.role, content: input.content,
        model: input.model ?? null, toolMetadata: input.toolMetadata ?? null, createdAt: new Date().toISOString(),
      };
      messages.push(row);
      return row;
    },
  };
}

function profileRepo(): HealthProfileRepository & { current: HealthProfileRecord | null } {
  const repo: HealthProfileRepository & { current: HealthProfileRecord | null } = {
    current: null,
    async get() { return repo.current; },
    async upsert(patch) {
      repo.current = {
        id: 'default', dateOfBirth: null, sexForBmr: null, heightCm: null, activityFactor: 1.2,
        defaultStepsGoal: 7500, dailyCaloriesGoalKcal: null, dailyProteinGoalGrams: null,
        ...repo.current, ...patch,
      };
      return repo.current;
    },
  };
  return repo;
}

function goalService(profileRepository: HealthProfileRepository) {
  const rows: ProfileGoalRevisionRecord[] = [];
  const revisions: ProfileGoalRevisionRepository = {
    async findActiveOn(date) {
      return [...rows]
        .filter(row => row.effectiveFrom <= date)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    },
    async list() { return [...rows]; },
    async count() { return rows.length; },
    async create(input) {
      const row: ProfileGoalRevisionRecord = {
        id: `goal-${rows.length + 1}`,
        createdAt: new Date().toISOString(),
        ...input,
      };
      rows.push(row);
      return row;
    },
  };
  return { service: new ProfileGoalService(revisions, profileRepository), rows };
}

const authorizer: RequestAuthorizer = {
  async authorize(_authorization, requiredScopes) {
    expect(requiredScopes).toContain('coach:write');
    return { tokenId: 'web-token', scopes: requiredScopes };
  },
};

async function setup(provider: { completeTurn(input: DeepSeekTurnInput): Promise<DeepSeekTurnResult> }) {
  const app = Fastify();
  const coachRepository = memoryCoachRepository();
  const profileRepository = profileRepo();
  const goals = goalService(profileRepository);
  const audits: AuditEventInput[] = [];
  const auditRepository: AuditRepository = { async record(event) { audits.push(event); } };
  registerCoachRoutes(app, {
    authorizer,
    coachRepository,
    deepseekClient: provider,
    coachModel: 'deepseek-flash',
    profileRepository,
    profileGoalService: goals.service,
    auditRepository,
    timeZone: 'Europe/Warsaw',
  });
  return { app, coachRepository, profileRepository, goalRows: goals.rows, audits };
}

describe('Coach conversation API', () => {
  it('persists a user/assistant turn and executes an allow-listed tool call', async () => {
    let call = 0;
    const { app, coachRepository, goalRows, audits } = await setup({
      async completeTurn(input) {
        call += 1;
        expect(input.messages[0]?.role).toBe('system');
        if (call === 1) {
          return {
            content: 'Ustawiam cel.',
            toolCalls: [{ id: 'tc1', name: 'set_default_step_goal', arguments: { steps: 8000 } }],
          };
        }
        const toolMessage = input.messages.find(message => message.role === 'tool');
        expect(toolMessage?.tool_call_id).toBe('tc1');
        return { content: 'Ustawiłem dzienny cel na 8000 kroków.', toolCalls: [] };
      },
    });

    const create = await app.inject({ method: 'POST', url: '/api/v1/coach/conversations', headers: { authorization: 'Bearer web' }, payload: { title: 'Mój trener' } });
    expect(create.statusCode).toBe(201);
    const conversationId = create.json().conversation.id as string;

    const response = await app.inject({
      method: 'POST', url: `/api/v1/coach/conversations/${conversationId}/messages`, headers: { authorization: 'Bearer web' },
      payload: { content: 'Ustaw mi 8000 kroków dziennie.' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().message).toMatchObject({ role: 'assistant', content: 'Ustawiłem dzienny cel na 8000 kroków.', model: 'deepseek-flash' });
    expect(response.json().actions).toEqual([{ toolCallId: 'tc1', name: 'set_default_step_goal', status: 'completed', result: expect.objectContaining({ defaultStepsGoal: 8000, source: 'coach' }) }]);
    expect(goalRows.at(-1)).toMatchObject({ defaultStepsGoal: 8000, source: 'coach', sourceRef: conversationId });
    expect(coachRepository.messages.map(message => message.role)).toEqual(['user', 'tool', 'assistant']);
    expect(audits).toHaveLength(1);
    await app.close();
  });

  it('keeps only current-turn completed actions when the provider fails afterwards', async () => {
    let call = 0;
    const { app, coachRepository, goalRows, audits } = await setup({
      async completeTurn() {
        call += 1;
        if (call === 1) return { content: null, toolCalls: [{ id: 'tc2', name: 'set_default_step_goal', arguments: { steps: 9000 } }] };
        throw new Error('DeepSeek API error 503');
      },
    });
    const conversation = await coachRepository.createConversation('Test');
    await coachRepository.addMessage({
      conversationId: conversation.id,
      role: 'tool',
      content: JSON.stringify({ defaultStepsGoal: 7000 }),
      model: 'deepseek-flash',
      toolMetadata: { toolCallId: 'old-tc', name: 'set_default_step_goal', status: 'completed' },
    });

    const response = await app.inject({
      method: 'POST', url: `/api/v1/coach/conversations/${conversation.id}/messages`, headers: { authorization: 'Bearer web' },
      payload: { content: 'Ustaw 9000 kroków.' },
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toMatchObject({ error: { code: 'coach_provider_error' } });
    expect(response.json().completedActions).toEqual([
      expect.objectContaining({ toolCallId: 'tc2', name: 'set_default_step_goal', status: 'completed' }),
    ]);
    expect(goalRows.at(-1)).toMatchObject({ defaultStepsGoal: 9000, source: 'coach', sourceRef: conversation.id });
    expect(coachRepository.messages.slice(-2).map(message => message.role)).toEqual(['user', 'tool']);
    expect(audits).toHaveLength(1);
    await app.close();
  });
});
