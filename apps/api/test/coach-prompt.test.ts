import { describe, expect, it } from 'vitest';
import { COACH_SYSTEM_PROMPT } from '../src/coach/system-prompt.js';

describe('Coach system prompt', () => {
  it('keeps the approved strict-but-fair coaching policy', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('surowo, ale sprawiedliwie');
    expect(COACH_SYSTEM_PROMPT).toContain('Brak danych oznacza brak danych');
    expect(COACH_SYSTEM_PROMPT).toContain('bez dodatkowego potwierdzenia');
    expect(COACH_SYSTEM_PROMPT).toContain('Nie diagnozuj');
    expect(COACH_SYSTEM_PROMPT).toContain('Pisz po polsku');
    expect(COACH_SYSTEM_PROMPT).toContain('trendach');
  });

  it('requires tool-bounded actions and forbids silent destructive initiative', () => {
    expect(COACH_SYSTEM_PROMPT).toContain('allow-listowanych narzędzi QND Health');
    expect(COACH_SYSTEM_PROMPT).toContain('istotną zmianę lub usunięcie danych');
    expect(COACH_SYSTEM_PROMPT).toContain('najpierw przedstaw propozycję');
  });
});
