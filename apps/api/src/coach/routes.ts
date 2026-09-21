import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { RequestAuthorizer } from '../auth/service.js';
import type { AuditRepository } from '../audit/repository.js';
import type { PlanRepository } from '../plans/repository.js';
import type { NutritionRepository } from '../nutrition/repository.js';
import type { MeasurementRepository } from '../measurements/repository.js';
import type { DailyHealthRepository } from '../health/repository.js';
import type { CompletedActivityRepository } from '../activities/repository.js';
import type { ActivityMatchRepository } from '../activities/matches.js';
import type { HealthProfileRepository } from '../profile/repository.js';
import { errorBody, sendValidationError } from '../http/errors.js';
import type { CoachRepository } from './repository.js';
import { COACH_SYSTEM_PROMPT } from './system-prompt.js';
import { buildCoachContext } from './context.js';
import type { DeepSeekMessage, DeepSeekTurnInput, DeepSeekTurnResult } from './deepseek.js';
import { coachTools, executeCoachTool, type CoachToolDependencies } from './tools.js';

export interface CoachTurnProvider {
  completeTurn(input: DeepSeekTurnInput): Promise<DeepSeekTurnResult>;
}

export interface CoachActionSummary {
  toolCallId: string;
  name: string;
  status: 'completed';
  result: unknown;
}

export interface CoachRouteDependencies extends CoachToolDependencies {
  authorizer: RequestAuthorizer;
  coachRepository: CoachRepository;
  deepseekClient: CoachTurnProvider | null;
  coachModel: string;
  auditRepository?: AuditRepository;
  planRepository?: PlanRepository;
  nutritionRepository?: NutritionRepository;
  measurementRepository?: MeasurementRepository;
  profileRepository?: HealthProfileRepository;
  dailyHealthRepository?: DailyHealthRepository;
  completedActivityRepository?: CompletedActivityRepository;
  activityMatchRepository?: ActivityMatchRepository;
  timeZone: string;
}

const conversationBodySchema = z.object({ title: z.string().trim().min(1).max(120).nullable().optional() });
const messageBodySchema = z.object({ content: z.string().trim().min(1).max(8000) });

function localIsoDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dayTimestampRange(date: string): { from: string; to: string } {
  return { from: `${date}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` };
}

async function authorize(request: FastifyRequest, deps: CoachRouteDependencies, mode: 'read' | 'write') {
  return deps.authorizer.authorize(request.headers.authorization, [mode === 'read' ? 'coach:read' : 'coach:write']);
}

async function buildCurrentContext(deps: CoachRouteDependencies) {
  const date = localIsoDate(new Date(), deps.timeZone);
  const from30 = shiftDate(date, -29);
  const from7 = shiftDate(date, -6);
  const todayRange = dayTimestampRange(date);
  const range30 = { from: `${from30}T00:00:00.000Z`, to: `${date}T23:59:59.999Z` };

  const [profile, health, plans, activities, nutrition, measurements, health30] = await Promise.all([
    deps.profileRepository?.get() ?? null,
    deps.dailyHealthRepository?.findByDate(date) ?? null,
    deps.planRepository?.list(from30, shiftDate(date, 7)) ?? [],
    deps.completedActivityRepository?.list(range30.from, range30.to) ?? [],
    deps.nutritionRepository?.list(range30.from, range30.to) ?? [],
    deps.measurementRepository?.list(range30.from, range30.to) ?? [],
    deps.dailyHealthRepository?.list(from30, date) ?? [],
  ]);

  const todayNutrition = nutrition.filter(entry => entry.consumedAt >= todayRange.from && entry.consumedAt <= todayRange.to);
  const sumPresent = (values: Array<number | null>) => {
    const present = values.filter((value): value is number => typeof value === 'number');
    return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
  };
  const todayTotals = {
    caloriesKcal: sumPresent(todayNutrition.map(entry => entry.caloriesKcal)),
    proteinGrams: sumPresent(todayNutrition.map(entry => entry.proteinGrams)),
    carbsGrams: sumPresent(todayNutrition.map(entry => entry.carbsGrams)),
    fatGrams: sumPresent(todayNutrition.map(entry => entry.fatGrams)),
    fiberGrams: sumPresent(todayNutrition.map(entry => entry.fiberGrams)),
  };

  const progressFor = (from: string) => {
    const periodPlans = plans.filter(item => item.date >= from && item.date <= date);
    const periodHealth = health30.filter(item => item.date >= from && item.date <= date);
    const stepValues = periodHealth.map(item => item.steps).filter((value): value is number => typeof value === 'number');
    const rhrValues = periodHealth.map(item => item.restingHr).filter((value): value is number => typeof value === 'number');
    const hrvValues = periodHealth.map(item => item.hrv).filter((value): value is number => typeof value === 'number');
    const sleepValues = periodHealth.map(item => item.sleepDurationSeconds).filter((value): value is number => typeof value === 'number');
    const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const completed = periodPlans.filter(item => item.status === 'completed').length;
    const partial = periodPlans.filter(item => item.status === 'partial').length;
    return {
      period: { from, to: date },
      plan: { completionPercent: periodPlans.length ? Math.round(((completed + partial * 0.5) / periodPlans.length) * 100) : null },
      averages: { steps: average(stepValues), restingHr: average(rhrValues), hrv: average(hrvValues), sleepDurationSeconds: average(sleepValues) },
      series: periodHealth.map(item => ({ date: item.date, steps: item.steps, stepsGoal: item.stepsGoal, restingHr: item.restingHr, hrv: item.hrv, sleepDurationSeconds: item.sleepDurationSeconds, vo2Max: item.vo2Max })),
    };
  };

  return buildCoachContext({
    date,
    profile,
    today: {
      health,
      latestMeasurement: measurements[0] ?? null,
      energy: null,
      activity: { steps: { current: health?.steps ?? 0, target: health?.stepsGoal ?? profile?.defaultStepsGoal ?? 7500, goalSource: health?.stepsGoal != null ? 'garmin' : profile ? 'profile' : 'fallback' } },
      nutrition: { goalKcal: profile?.dailyCaloriesGoalKcal ?? null, summary: { totals: todayTotals } },
    },
    plans,
    activities,
    nutrition,
    measurements,
    progress7: progressFor(from7),
    progress30: progressFor(from30),
  });
}

function providerHistory(messages: Awaited<ReturnType<CoachRepository['listMessages']>>): DeepSeekMessage[] {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map(message => ({ role: message.role as 'user' | 'assistant', content: message.content }));
}

async function runTurn(
  deps: CoachRouteDependencies,
  conversationId: string,
  requestId: string,
): Promise<{ message: Awaited<ReturnType<CoachRepository['addMessage']>>; actions: CoachActionSummary[] }> {
  if (!deps.deepseekClient) throw new Error('Coach provider is not configured');
  const [context, persistedMessages] = await Promise.all([
    buildCurrentContext(deps),
    deps.coachRepository.listMessages(conversationId),
  ]);
  const messages: DeepSeekMessage[] = [
    { role: 'system', content: COACH_SYSTEM_PROMPT },
    { role: 'system', content: `Aktualny, znormalizowany kontekst QND Health (brak wartości oznacza brak danych):\n${JSON.stringify(context)}` },
    ...providerHistory(persistedMessages),
  ];
  const actions: CoachActionSummary[] = [];

  for (let round = 0; round < 6; round += 1) {
    const turn = await deps.deepseekClient.completeTurn({ messages, tools: coachTools });
    if (turn.toolCalls.length === 0) {
      const content = turn.content?.trim();
      if (!content) throw new Error('DeepSeek returned an empty response');
      const message = await deps.coachRepository.addMessage({
        conversationId, role: 'assistant', content, model: deps.coachModel, toolMetadata: actions.length ? { actions } : null,
      });
      return { message, actions };
    }

    messages.push({
      role: 'assistant',
      content: turn.content,
      tool_calls: turn.toolCalls.map(call => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.arguments) } })),
    });

    for (const call of turn.toolCalls) {
      const result = await executeCoachTool(call.name, call.arguments, deps, {
        conversationId,
        requestId,
        timeZone: deps.timeZone,
      });
      const action: CoachActionSummary = { toolCallId: call.id, name: call.name, status: 'completed', result };
      actions.push(action);
      await deps.coachRepository.addMessage({
        conversationId,
        role: 'tool',
        content: JSON.stringify(result),
        model: deps.coachModel,
        toolMetadata: { toolCallId: call.id, name: call.name, status: 'completed' },
      });
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }

  throw new Error('Coach exceeded the tool-call round limit');
}

function sendProviderError(reply: FastifyReply, request: FastifyRequest, completedActions: CoachActionSummary[]) {
  return reply.status(502).send({
    ...errorBody(request, 'coach_provider_error', 'Coach provider failed before a final response was produced'),
    completedActions,
  });
}

export function registerCoachRoutes(app: FastifyInstance, deps: CoachRouteDependencies): void {
  app.get('/api/v1/coach/conversations', async (request, reply) => {
    await authorize(request, deps, 'read');
    return reply.send({ conversations: await deps.coachRepository.listConversations() });
  });

  app.post('/api/v1/coach/conversations', async (request, reply) => {
    await authorize(request, deps, 'write');
    const parsed = conversationBodySchema.safeParse(request.body ?? {});
    if (!parsed.success) return sendValidationError(reply, request, 'Invalid conversation', parsed.error.flatten());
    const conversation = await deps.coachRepository.createConversation(parsed.data.title ?? null);
    return reply.status(201).send({ conversation });
  });

  app.get('/api/v1/coach/conversations/:id/messages', async (request, reply) => {
    await authorize(request, deps, 'read');
    const { id } = request.params as { id: string };
    const conversation = await deps.coachRepository.findConversation(id);
    if (!conversation) return reply.status(404).send(errorBody(request, 'not_found', 'Coach conversation not found'));
    return reply.send({ conversation, messages: await deps.coachRepository.listMessages(id) });
  });

  app.post('/api/v1/coach/conversations/:id/messages', async (request, reply) => {
    await authorize(request, deps, 'write');
    const { id } = request.params as { id: string };
    const conversation = await deps.coachRepository.findConversation(id);
    if (!conversation) return reply.status(404).send(errorBody(request, 'not_found', 'Coach conversation not found'));
    if (!deps.deepseekClient) return reply.status(503).send(errorBody(request, 'coach_not_configured', 'DeepSeek is not configured on the server'));
    const parsed = messageBodySchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, request, 'Message content is required', parsed.error.flatten());

    await deps.coachRepository.addMessage({ conversationId: id, role: 'user', content: parsed.data.content });
    const completedActions: CoachActionSummary[] = [];
    try {
      const result = await runTurn({
        ...deps,
        deepseekClient: {
          async completeTurn(input) {
            try {
              return await deps.deepseekClient!.completeTurn(input);
            } catch (error) {
              (error as Error & { completedActions?: CoachActionSummary[] }).completedActions = [...completedActions];
              throw error;
            }
          },
        },
      }, id, request.id);
      completedActions.push(...result.actions);
      return reply.send(result);
    } catch (error) {
      const toolMessages = await deps.coachRepository.listMessages(id);
      const actions = toolMessages
        .filter(message => message.role === 'tool')
        .map(message => message.toolMetadata)
        .filter((metadata): metadata is Record<string, unknown> => Boolean(metadata && typeof metadata === 'object'))
        .filter(metadata => typeof metadata.toolCallId === 'string' && typeof metadata.name === 'string')
        .map(metadata => ({
          toolCallId: String(metadata.toolCallId),
          name: String(metadata.name),
          status: 'completed' as const,
          result: (() => { try { return JSON.parse(toolMessages.find(message => message.toolMetadata === metadata)?.content ?? 'null'); } catch { return null; } })(),
        }));
      request.log.warn({ err: error }, 'coach provider turn failed');
      return sendProviderError(reply, request, actions);
    }
  });
}
