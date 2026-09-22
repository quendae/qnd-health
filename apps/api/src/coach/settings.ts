export interface CoachSettingsRepository {
  getSystemPromptOverride(): Promise<string | null>;
  setSystemPromptOverride(value: string | null): Promise<void>;
}
