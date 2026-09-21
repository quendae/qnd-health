import { describe, expect, it } from 'vitest';
import type { AuditEventInput, AuditRepository } from '../src/audit/repository.js';
import { coachTools, executeCoachTool } from '../src/coach/tools.js';
import type { PlanRepository, StoredPlanItem } from '../src/plans/repository.js';
import type { HealthProfileRecord, HealthProfileRepository } from '../src/profile/repository.js';

describe('Coach tools', () => {
  it('exposes only the approved allow-list', () => {
    expect(coachTools.map(tool => tool.function.name)).toEqual([
      'get_today', 'get_progress', 'get_history', 'list_plans', 'list_activities', 'list_nutrition', 'get_profile',
      'create_plan', 'update_plan', 'delete_plan', 'set_plan_progress', 'attach_activity', 'create_custom_activity',
      'create_nutrition', 'update_nutrition', 'delete_nutrition', 'create_measurement', 'update_profile', 'set_default_step_goal',
    ]);
  });

  it('updates the default step goal and records a coach audit event', async () => {
    let profile: HealthProfileRecord | null = null;
    const audits: AuditEventInput[] = [];
    const profileRepository: HealthProfileRepository = {
      async get() { return profile; },
      async upsert(patch) {
        profile = {
          id: 'default', dateOfBirth: null, sexForBmr: null, heightCm: null,
          activityFactor: 1.2, defaultStepsGoal: 7500, dailyCaloriesGoalKcal: null, dailyProteinGoalGrams: null,
          ...profile, ...patch,
        };
        return profile;
      },
    };
    const auditRepository: AuditRepository = { async record(event) { audits.push(event); } };

    const result = await executeCoachTool('set_default_step_goal', { steps: 8000 }, {
      profileRepository,
      auditRepository,
    }, { conversationId: 'conv-1', requestId: 'req-1', timeZone: 'Europe/Warsaw' });

    expect(result).toMatchObject({ defaultStepsGoal: 8000 });
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actorType: 'coach', action: 'profile.set_default_step_goal', entityType: 'health_profile', entityId: 'default', requestId: 'req-1',
    });
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
