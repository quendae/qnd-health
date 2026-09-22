import { describe, expect, it } from 'vitest';
import type { AuditEventInput, AuditRepository } from '../src/audit/repository.js';
import { coachTools, executeCoachTool } from '../src/coach/tools.js';
import type { PlanRepository, StoredPlanItem } from '../src/plans/repository.js';
import { ProfileGoalService } from '../src/profile/goals.js';
import type { ProfileGoalRevisionRecord, ProfileGoalRevisionRepository, ProfileGoalValues } from '../src/profile/goal-repository.js';
import type { HealthProfileRecord, HealthProfileRepository } from '../src/profile/repository.js';

function goalHarness() {
  const profile: HealthProfileRecord = {
    id: 'default', dateOfBirth: null, sexForBmr: null, heightCm: null,
    activityFactor: 1.2, defaultStepsGoal: 7500, dailyCaloriesGoalKcal: 2000, dailyProteinGoalGrams: 150,
  };
  const rows: ProfileGoalRevisionRecord[] = [];
  const profileRepository: HealthProfileRepository = {
    async get() { return profile; },
    async upsert(patch) { Object.assign(profile, patch); return profile; },
  };
  const revisions: ProfileGoalRevisionRepository = {
    async findActiveOn(date) {
      return [...rows].filter(row => row.effectiveFrom <= date).sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    },
    async list() { return [...rows]; },
    async count() { return rows.length; },
    async create(input) {
      const row: ProfileGoalRevisionRecord = { id: `g${rows.length + 1}`, createdAt: '2026-09-22T07:00:00.000Z', ...input };
      rows.push(row);
      return row;
    },
  };
  return { profileRepository, rows, goalService: new ProfileGoalService(revisions, profileRepository) };
}

describe('Coach tools', () => {
  it('exposes only the approved allow-list', () => {
    expect(coachTools.map(tool => tool.function.name)).toEqual([
      'get_today', 'get_progress', 'get_history', 'list_plans', 'list_activities', 'list_nutrition', 'get_profile',
      'create_plan', 'update_plan', 'delete_plan', 'set_plan_progress', 'attach_activity', 'create_custom_activity',
      'create_nutrition', 'update_nutrition', 'delete_nutrition', 'create_measurement', 'update_profile', 'set_profile_goals', 'set_default_step_goal',
    ]);
  });

  it('creates a dated coach revision for nutrition, steps and activity goals', async () => {
    const { profileRepository, rows, goalService } = goalHarness();
    const audits: AuditEventInput[] = [];
    const auditRepository: AuditRepository = { async record(event) { audits.push(event); } };

    const result = await executeCoachTool('set_profile_goals', {
      dailyCaloriesGoalKcal: 1900,
      dailyProteinGoalGrams: 170,
      dailyCarbsGoalGrams: 180,
      dailyFatGoalGrams: 65,
      dailyFiberGoalGrams: 32,
      defaultStepsGoal: 9000,
      activityFactor: 1.35,
      reason: 'Zmiana po analizie ostatnich 30 dni',
    }, {
      profileRepository,
      profileGoalService: goalService,
      auditRepository,
    }, { conversationId: 'conv-1', requestId: 'req-goals', timeZone: 'Europe/Warsaw', now: '2026-09-22T07:15:00.000Z' });

    expect(result).toMatchObject({
      effectiveFrom: '2026-09-22', source: 'coach', sourceRef: 'conv-1',
      dailyCaloriesGoalKcal: 1900, dailyProteinGoalGrams: 170, dailyCarbsGoalGrams: 180,
      dailyFatGoalGrams: 65, dailyFiberGoalGrams: 32, defaultStepsGoal: 9000, activityFactor: 1.35,
    });
    expect(rows).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actorType: 'coach', action: 'profile.goals.revise', entityType: 'profile_goal_revision', requestId: 'req-goals' });
  });

  it('updates the default step goal through a dated goal revision', async () => {
    const { profileRepository, rows, goalService } = goalHarness();
    const audits: AuditEventInput[] = [];
    const auditRepository: AuditRepository = { async record(event) { audits.push(event); } };

    const result = await executeCoachTool('set_default_step_goal', { steps: 8000 }, {
      profileRepository,
      profileGoalService: goalService,
      auditRepository,
    }, { conversationId: 'conv-1', requestId: 'req-1', timeZone: 'Europe/Warsaw', now: '2026-09-22T07:15:00.000Z' });

    expect(result).toMatchObject({ defaultStepsGoal: 8000, effectiveFrom: '2026-09-22', source: 'coach' });
    expect(rows).toHaveLength(1);
    expect(audits).toHaveLength(1);
  });

  it('updates manual plan progress through validated tool arguments', async () => {
    let plan: StoredPlanItem = {
      id: 'p1', date: '2026-09-21', kind: 'count_goal', title: 'Pompki', completionStrategy: 'count_manual',
      metricKey: null, targetValue: 30, currentManualValue: 0, unit: 'powt.', status: 'planned',
    };
    const planRepository: PlanRepository = {
      async create(input) { plan = { id: 'new', ...input }; return plan; },
      async list() { return [plan]; },
      async findById(id) { return id === plan.id ? plan : null; },
      async update(id, patch) { if (id !== plan.id) return null; plan = { ...plan, ...patch }; return plan; },
      async delete() { return false; },
    };

    const result = await executeCoachTool('set_plan_progress', { planId: 'p1', value: 15 }, {
      planRepository,
    }, { conversationId: 'conv-1', requestId: 'req-2', timeZone: 'Europe/Warsaw' });

    expect(result).toMatchObject({ id: 'p1', currentManualValue: 15, status: 'partial' });
  });

  it('refuses unknown tools instead of dispatching arbitrary operations', async () => {
    await expect(executeCoachTool('run_shell', { command: 'rm -rf /' }, {}, {
      conversationId: 'conv-1', requestId: 'req-3', timeZone: 'Europe/Warsaw',
    })).rejects.toThrow('Unknown Coach tool');
  });
});
