import { describe, expect, it } from 'vitest';
import { coachActionLabel, transientCoachActions, visibleCoachMessages } from './coach-view-model';
import type { CoachAction, CoachMessage } from './types';

describe('Coach chat view model', () => {
  it('hides technical tool and system messages from the conversation', () => {
    const messages: CoachMessage[] = [
      { id: '1', conversationId: 'c1', role: 'system', content: 'system', model: null, toolMetadata: null, createdAt: '2026-09-21T18:00:00Z' },
      { id: '2', conversationId: 'c1', role: 'user', content: 'Ustaw 8000 kroków', model: null, toolMetadata: null, createdAt: '2026-09-21T18:01:00Z' },
      { id: '3', conversationId: 'c1', role: 'tool', content: '{"defaultStepsGoal":8000}', model: 'deepseek-flash', toolMetadata: { name: 'set_default_step_goal' }, createdAt: '2026-09-21T18:01:01Z' },
      { id: '4', conversationId: 'c1', role: 'assistant', content: 'Ustawiłem cel.', model: 'deepseek-flash', toolMetadata: null, createdAt: '2026-09-21T18:01:02Z' },
    ];

    expect(visibleCoachMessages(messages).map(message => message.role)).toEqual(['user', 'assistant']);
  });

  it('renders human-readable summaries for common Coach actions', () => {
    expect(coachActionLabel({ toolCallId: 'a', name: 'set_default_step_goal', status: 'completed', result: { defaultStepsGoal: 8000 } })).toBe('Cel kroków zmieniony na 8000');
    expect(coachActionLabel({ toolCallId: 'b', name: 'set_calorie_goal', status: 'completed', result: { dailyCaloriesGoalKcal: 2200 } })).toBe('Cel kalorii zmieniony na 2200 kcal');
    expect(coachActionLabel({ toolCallId: 'c', name: 'set_protein_goal', status: 'completed', result: { dailyProteinGoalGrams: 160 } })).toBe('Cel białka zmieniony na 160 g');
  });

  it('falls back to a safe generic label for unknown actions', () => {
    expect(coachActionLabel({ toolCallId: 'x', name: 'future_tool', status: 'completed', result: {} })).toBe('Zmiana zapisana przez Coacha');
  });

  it('shows transient actions only for partial provider failures because successful actions are persisted with the assistant message', () => {
    const actions: CoachAction[] = [{ toolCallId: 'a', name: 'set_default_step_goal', status: 'completed', result: { defaultStepsGoal: 8000 } }];
    expect(transientCoachActions('success', actions)).toEqual([]);
    expect(transientCoachActions('partial_error', actions)).toEqual(actions);
  });
});
