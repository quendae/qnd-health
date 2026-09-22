import type { CoachTurnProvider } from './routes.js';
import type { DeepSeekTurnInput, DeepSeekTurnResult } from './deepseek.js';
import type { CoachSettingsRepository } from './settings.js';

export class CoachSettingsAwareProvider implements CoachTurnProvider {
  constructor(
    private readonly inner: CoachTurnProvider,
    private readonly settings: CoachSettingsRepository,
  ) {}

  async completeTurn(input: DeepSeekTurnInput): Promise<DeepSeekTurnResult> {
    const override = await this.settings.getSystemPromptOverride();
    if (!override) return this.inner.completeTurn(input);

    const messages = input.messages.map((message, index) => (
      index === 0 && message.role === 'system'
        ? { ...message, content: override }
        : message
    ));
    return this.inner.completeTurn({ ...input, messages });
  }
}
