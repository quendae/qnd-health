import type { CoachAction, CoachMessage } from './types';

export function visibleCoachMessages(messages: CoachMessage[]): CoachMessage[] {
  return messages.filter(message => message.role === 'user' || message.role === 'assistant');
}

export function transientCoachActions(kind: 'success' | 'partial_error', actions: CoachAction[]): CoachAction[] {
  return kind === 'partial_error' ? actions : [];
}

function numberFromResult(result: unknown, key: string): number | null {
  if (!result || typeof result !== 'object') return null;
  const value = (result as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatWhole(value: number): string {
  return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 }).format(value);
}

export function coachActionLabel(action: CoachAction): string {
  if (action.name === 'set_default_step_goal') {
    const steps = numberFromResult(action.result, 'defaultStepsGoal');
    return steps == null ? 'Cel kroków został zmieniony' : `Cel kroków zmieniony na ${formatWhole(steps)}`;
  }
  if (action.name === 'update_profile') return 'Profil i cele zostały zaktualizowane';
  if (action.name === 'create_nutrition') return 'Dodano wpis żywieniowy';
  if (action.name === 'update_nutrition') return 'Zmieniono wpis żywieniowy';
  if (action.name === 'delete_nutrition') return 'Usunięto wpis żywieniowy';
  if (action.name === 'create_plan') return 'Dodano pozycję do planu';
  if (action.name === 'update_plan') return 'Zmieniono pozycję w planie';
  if (action.name === 'delete_plan') return 'Usunięto pozycję z planu';
  if (action.name === 'set_plan_progress') return 'Zaktualizowano wykonanie planu';
  if (action.name === 'attach_activity') return 'Połączono aktywność z planem';
  if (action.name === 'create_custom_activity') return 'Dodano wykonaną aktywność';
  if (action.name === 'create_measurement') return 'Dodano pomiar';
  return 'Zmiana zapisana przez Coacha';
}

export function conversationTitle(title: string | null, createdAt: string): string {
  if (title?.trim()) return title.trim();
  const date = new Date(createdAt);
  return `Rozmowa · ${date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' })}`;
}
