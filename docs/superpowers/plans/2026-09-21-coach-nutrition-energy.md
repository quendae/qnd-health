# QND Health Coach, Nutrition and Energy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend QND Health with editable nutrition, permanent steps and quick activity logging, BMR/TDEE/profile support, richer Garmin ingestion, and an action-capable DeepSeek Coach chat.

**Architecture:** Keep all writes behind the existing Fastify/domain/repository boundaries. Today remains a composed read model; profile/energy helpers feed it without duplicating provider data. DeepSeek runs server-side only and calls a fixed allow-list of internal QND Health tools that reuse validation, audit and repository semantics.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7 + SQLite, React/Vite, Vitest, Zod, DeepSeek OpenAI-compatible chat API.

**Spec:** `docs/superpowers/specs/2026-09-21-coach-nutrition-energy-design.md`

## Global Constraints

- User-facing UI is Polish.
- Missing health/nutrition data stays `null`/unknown and is never silently converted to zero.
- Garmin data ingested through Home Assistant keeps `source=garmin` and `transport=home_assistant`.
- Default step goal fallback is exactly `7500` when neither provider nor profile supplies a valid goal.
- Phase-1 BMR uses Mifflin-St Jeor; Phase-1 TDEE is `BMR × activityFactor`.
- Initial `activityFactor` is exactly `1.2`, visible/editable in Settings.
- DeepSeek credentials stay server-side; browser never calls DeepSeek directly.
- Default DeepSeek model alias is `deepseek-chat`; it remains overrideable via `DEEPSEEK_MODEL`.
- DeepSeek may execute only allow-listed QND Health tools; no arbitrary HTTP, SQL, shell or endpoint execution.
- Explicit unambiguous user commands execute immediately; ambiguous commands ask one focused question; Coach-originated destructive/significant proposals are presented before execution.
- Coach receives normalized summaries, never raw Garmin/Home Assistant payload dumps or GPS tracks by default.
- Full CI remains mandatory: tests, typecheck, build, runtime smoke, native SQLite smoke, Docker build.

## Review Focus

1. **Floating-point nutrition artifacts:** `120.600000000001` renders as `120,6`, while `53.0` renders as `53`.
2. **Step-goal precedence:** provider goal wins; invalid/zero provider goal falls to profile; missing profile falls to `7500`.
3. **DOB edges:** birthday today/tomorrow, leap-day DOB and future DOB produce correct validation/age behavior.
4. **Coach ambiguity:** duplicate matching nutrition entries must not be guessed for destructive mutations.
5. **Partial Coach failure:** completed tool writes remain auditable and are reported if the model/provider fails afterward.

---

## File Map

**Backend create:**
- `apps/api/src/profile/repository.ts`
- `apps/api/src/profile/routes.ts`
- `apps/api/src/profile/energy.ts`
- `apps/api/src/coach/repository.ts`
- `apps/api/src/coach/system-prompt.ts`
- `apps/api/src/coach/context.ts`
- `apps/api/src/coach/deepseek.ts`
- `apps/api/src/coach/tools.ts`
- `apps/api/src/coach/routes.ts`
- `apps/api/src/today/step-goal.ts`

**Backend modify:**
- `database/prisma/schema.prisma`
- `apps/api/src/persistence/prisma-repositories.ts`
- `apps/api/src/app.ts`
- `apps/api/src/runtime.ts`
- `apps/api/src/server.ts`
- `apps/api/src/config.ts`
- `apps/api/src/nutrition/routes.ts`
- `apps/api/src/nutrition/repository.ts`
- `apps/api/src/health/repository.ts`
- `apps/api/src/health/routes.ts`
- `apps/api/src/plans/routes.ts`
- `apps/api/src/today/routes.ts`
- `apps/api/src/openapi.ts`
- `packages/activity-model/src/plan-item.ts`

**Frontend create:**
- `apps/web/src/NutritionEntryDialog.tsx`
- `apps/web/src/activity-presets.ts`
- `apps/web/src/ProfileSettings.tsx`
- `apps/web/src/CoachView.tsx`
- `apps/web/src/format-number.ts`

**Frontend modify:**
- `apps/web/src/App.tsx`
- `apps/web/src/api.ts`
- `apps/web/src/types.ts`
- `apps/web/src/SettingsView.tsx`
- `apps/web/src/features.css`
- `apps/web/src/insights.css`

---

### Task 1: Nutrition CRUD, rounded macros and simplified UI

**Files:**
- Modify: `apps/api/src/nutrition/routes.ts`
- Modify: `apps/api/src/nutrition/repository.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/openapi.ts`
- Test: `apps/api/test/nutrition-api.test.ts`
- Create: `apps/web/src/NutritionEntryDialog.tsx`
- Create: `apps/web/src/format-number.ts`
- Create/Test: `apps/web/src/format-number.test.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features.css`

**Produces:**
- `PATCH /api/v1/nutrition/:id`
- `DELETE /api/v1/nutrition/:id`
- `formatMetric(value: number | null, maximumFractionDigits?: number): string`
- `QndHealthApi.updateNutrition()` / `deleteNutrition()`

- [ ] **Step 1: Write failing nutrition CRUD/default tests**

```ts
const created = await authorized.inject({
  method: 'POST', url: '/api/v1/nutrition',
  payload: { title: 'Owsianka', caloriesKcal: 420 },
});
expect(created.statusCode).toBe(201);
expect(created.json().mealType).toBe('other');
expect(Number.isNaN(Date.parse(created.json().consumedAt))).toBe(false);

const id = created.json().id;
const edited = await authorized.inject({
  method: 'PATCH', url: `/api/v1/nutrition/${id}`,
  payload: { caloriesKcal: 390, proteinGrams: 31.2 },
});
expect(edited.statusCode).toBe(200);
expect(edited.json()).toMatchObject({ caloriesKcal: 390, proteinGrams: 31.2 });
expect((await authorized.inject({ method: 'DELETE', url: `/api/v1/nutrition/${id}` })).statusCode).toBe(204);
```

Also test unknown ID → 404 and negative/malformed metric → 422.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- nutrition-api.test.ts
```

Expected: create-metadata/PATCH/DELETE failures.

- [ ] **Step 3: Implement API defaults + PATCH/DELETE**

Use optional create metadata:

```ts
const createSchema = z.object({
  consumedAt: timestampSchema.optional(),
  mealType: z.enum(['breakfast','lunch','dinner','snack','other']).optional(),
  title: z.string().trim().min(1).max(200),
  caloriesKcal: nullableMetric,
  proteinGrams: nullableMetric,
  carbsGrams: nullableMetric,
  fatGrams: nullableMetric,
  fiberGrams: nullableMetric,
  quantityText: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
```

Server supplies current timestamp and `other` when omitted. PATCH is partial. Both write routes use existing safe-write/idempotency/audit with actions `nutrition.update` / `nutrition.delete`.

- [ ] **Step 4: Write frontend formatter tests**

```ts
expect(formatMetric(120.600000000001)).toBe('120,6');
expect(formatMetric(53)).toBe('53');
expect(formatMetric(null)).toBe('—');
```

- [ ] **Step 5: Implement compact Nutrition UI**

Remove visible time, meal type and `Dane kompletne`/`Brak części danych`. Render title, kcal, B/W/T/błonnik with `formatMetric`. Add compact Edit/Delete actions; edit dialog exposes title, kcal, protein, carbs, fat, fiber, quantity, notes. Successful writes reload Today.

- [ ] **Step 6: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- nutrition-api.test.ts
pnpm --filter @qnd-health/web test -- format-number.test.ts
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/nutrition apps/api/src/persistence/prisma-repositories.ts apps/api/src/openapi.ts apps/api/test/nutrition-api.test.ts apps/web/src
git commit -m "feat: make nutrition editable"
```

---

### Task 2: Permanent steps + Pompki/Wiszenie/Rower presets

**Files:**
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/health/repository.ts`
- Modify: `apps/api/src/health/routes.ts`
- Create: `apps/api/src/today/step-goal.ts`
- Modify: `apps/api/src/today/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `packages/activity-model/src/plan-item.ts`
- Modify: `apps/api/src/plans/routes.ts`
- Test: `packages/activity-model/test/plan-item.test.ts`
- Test: `apps/api/test/today-api.test.ts`
- Test: `apps/api/test/garmin-ha-ingestion-api.test.ts`
- Create: `apps/web/src/activity-presets.ts`
- Create/Test: `apps/web/src/activity-presets.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/features.css`

**Produces:**
- optional `DailyHealth.stepsGoal`
- Today `activity.steps = { current, target, goalSource }`
- quick presets `pushups`, `hang`, `stationary_bike`
- manual completion support for `activity_link` workouts while preserving later Garmin attachment

- [ ] **Step 1: Write failing step-goal resolver/read-model tests**

```ts
expect(resolveStepGoal(9000, 8000)).toEqual({ target: 9000, source: 'garmin' });
expect(resolveStepGoal(null, 8000)).toEqual({ target: 8000, source: 'profile' });
expect(resolveStepGoal(0, null)).toEqual({ target: 7500, source: 'fallback' });
```

Route test: Today returns a steps model even with no plan items.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- today-api.test.ts garmin-ha-ingestion-api.test.ts
```

- [ ] **Step 3: Add `stepsGoal` persistence/ingestion + resolver**

```ts
export function resolveStepGoal(providerGoal?: number | null, profileGoal?: number | null) {
  if (providerGoal != null && providerGoal > 0) return { target: Math.round(providerGoal), source: 'garmin' as const };
  if (profileGoal != null && profileGoal > 0) return { target: Math.round(profileGoal), source: 'profile' as const };
  return { target: 7500, source: 'fallback' as const };
}
```

Task 2 uses `profileGoal=null`; Task 3 wires real profile data.

- [ ] **Step 4: Write failing activity-link manual completion test**

```ts
expect(calculatePlanProgress({
  strategy: 'activity_link', targetValue: null, currentValue: null,
  linkedActivityId: null, manualCompleted: true,
}).status).toBe('completed');
```

Also verify adding a `linkedActivityId` later remains completed and reuses the same plan record.

- [ ] **Step 5: Generalize progress semantics**

In `packages/activity-model/src/plan-item.ts`, honor explicit `manualCompleted` for `activity_link`, while linked provider activity still completes it naturally. Update plan-progress route validation so explicit manual completion of such workouts is accepted.

- [ ] **Step 6: Write preset builder tests**

```ts
expect(buildPresetPlan('pushups', '2026-09-21', 20)).toMatchObject({
  title: 'Pompki', kind: 'count_goal', completionStrategy: 'count_manual', targetValue: 20, unit: 'powt.'
});
expect(buildPresetPlan('hang', '2026-09-21', 45)).toMatchObject({
  title: 'Wiszenie na drążku', kind: 'count_goal', completionStrategy: 'count_manual', targetValue: 45, unit: 's'
});
expect(buildPresetPlan('stationary_bike', '2026-09-21', 30)).toMatchObject({
  title: 'Rower stacjonarny', kind: 'workout', completionStrategy: 'activity_link', activityType: 'indoor_cycling', plannedDurationSeconds: 1800
});
expect(() => buildPresetPlan('pushups', '2026-09-21', 0)).toThrow();
```

- [ ] **Step 7: Implement quick-add controls**

```ts
export const activityPresets = [
  { id: 'pushups', label: 'Pompki', inputUnit: 'powt.', tracking: 'count' },
  { id: 'hang', label: 'Wiszenie na drążku', inputUnit: 's', tracking: 'count' },
  { id: 'stationary_bike', label: 'Rower stacjonarny', inputUnit: 'min', tracking: 'duration', activityType: 'indoor_cycling' },
] as const;
```

Render directly under steps. Submit creates a normal plan item and immediately records entered completion. Stationary bike remains eligible for later Garmin candidate attachment.

- [ ] **Step 8: Verify GREEN**

```bash
pnpm --filter @qnd-health/activity-model test
pnpm --filter @qnd-health/api test -- today-api.test.ts garmin-ha-ingestion-api.test.ts
pnpm --filter @qnd-health/web test -- activity-presets.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

- [ ] **Step 9: Commit**

```bash
git add database/prisma/schema.prisma packages/activity-model apps/api/src apps/api/test apps/web/src
git commit -m "feat: add permanent steps and quick activities"
```

---

### Task 3: Health Profile + Mifflin-St Jeor BMR/TDEE

**Files:**
- Modify: `database/prisma/schema.prisma`
- Create: `apps/api/src/profile/repository.ts`
- Create: `apps/api/src/profile/energy.ts`
- Create: `apps/api/src/profile/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/today/routes.ts`
- Modify: `apps/api/src/openapi.ts`
- Create/Test: `apps/api/test/profile-energy.test.ts`
- Modify/Test: `apps/api/test/today-api.test.ts`
- Create: `apps/web/src/ProfileSettings.tsx`
- Modify: `apps/web/src/SettingsView.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`

**Produces:**
- `HealthProfileRecord`
- `GET /api/v1/profile`, `PATCH /api/v1/profile`
- `calculateAge()`, `calculateBmr()`, `calculateTdee()`
- Today `energy` model and profile-backed step target

- [ ] **Step 1: Write failing formula/date tests**

```ts
expect(calculateAge('1990-09-21', '2026-09-21')).toBe(36);
expect(calculateAge('1990-09-22', '2026-09-21')).toBe(35);
expect(() => calculateAge('2030-01-01', '2026-09-21')).toThrow();
expect(calculateTdee(2000, 1.2)).toBe(2400);
```

Add male/female Mifflin-St Jeor fixtures and leap-day DOB case.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- profile-energy.test.ts
```

- [ ] **Step 3: Add single-user profile model/repository**

```prisma
model HealthProfile {
  id               String   @id @default("default")
  dateOfBirth      DateTime?
  sexForBmr        String?
  heightCm         Float?
  activityFactor   Float    @default(1.2)
  defaultStepsGoal Int      @default(7500)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
}
```

Repository: `get()` and `upsert(patch)`.

- [ ] **Step 4: Implement validated profile API**

```ts
const profilePatchSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sexForBmr: z.enum(['male','female']).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),
  activityFactor: z.number().min(1).max(3).optional(),
  defaultStepsGoal: z.number().int().min(1).max(100000).optional(),
});
```

Future DOB → 422. Audit as `profile.update`.

- [ ] **Step 5: Compose energy into Today**

Use latest weight + complete profile only. Return `energy=null` otherwise. When available return `{ bmrKcal, tdeeKcal, source: 'mifflin_st_jeor', activityFactor }`. Replace default Body Battery top card with TDEE labeled `szacowane`. Body Battery remains stored for History/Progress/customization.

- [ ] **Step 6: Add Settings profile editor**

Fields: DOB, sex-for-BMR, height, activity factor, default steps. Show explanatory text and computed preview only when sufficient inputs exist.

- [ ] **Step 7: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- profile-energy.test.ts today-api.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
pnpm build
```

- [ ] **Step 8: Commit**

```bash
git add database/prisma/schema.prisma apps/api/src/profile apps/api/src/persistence apps/api/src/app.ts apps/api/src/runtime.ts apps/api/src/today apps/api/src/openapi.ts apps/api/test apps/web/src
git commit -m "feat: add health profile and energy estimates"
```

---

### Task 4: Rich Garmin/Home Assistant daily metrics

**Files:**
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/health/repository.ts`
- Modify: `apps/api/src/health/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify/Test: `apps/api/test/garmin-ha-ingestion-api.test.ts`
- Modify: `apps/web/src/types.ts`

**Produces:** `floorsDescended`, `vo2Max`, `providerBmrKcal`, `stepsGoal`; provider-specific readiness/recovery may remain structured JSON.

- [ ] **Step 1: Write failing ingestion test**

```ts
const response = await putDaily({
  stepsGoal: 9000,
  floorsDescended: 3.58,
  vo2Max: 38,
  providerBmrKcal: 1390,
  readiness: { trainingStatus: 'maintaining', recoveryHours: 18 },
});
expect(response.json()).toMatchObject({ stepsGoal: 9000, floorsDescended: 3.58, vo2Max: 38, providerBmrKcal: 1390 });
```

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- garmin-ha-ingestion-api.test.ts
```

- [ ] **Step 3: Implement schema/repository/route fields**

Add nullable finite non-negative fields. Preserve Garmin/Home Assistant provenance. Keep readiness/training status/recovery values in existing structured JSON where no cross-app normalized field is needed.

- [ ] **Step 4: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- garmin-ha-ingestion-api.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add database/prisma/schema.prisma apps/api/src/health apps/api/src/persistence/prisma-repositories.ts apps/api/src/openapi.ts apps/api/test/garmin-ha-ingestion-api.test.ts apps/web/src/types.ts
git commit -m "feat: ingest richer garmin metrics"
```

---

### Task 5: Coach persistence, normalized context and canonical prompt

**Files:**
- Modify: `database/prisma/schema.prisma`
- Create: `apps/api/src/coach/repository.ts`
- Create: `apps/api/src/coach/system-prompt.ts`
- Create: `apps/api/src/coach/context.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Create/Test: `apps/api/test/coach-context.test.ts`
- Create/Test: `apps/api/test/coach-prompt.test.ts`

**Produces:** `COACH_SYSTEM_PROMPT`, `buildCoachContext()`, persisted conversations/messages.

- [ ] **Step 1: Write prompt policy tests**

```ts
expect(COACH_SYSTEM_PROMPT).toContain('surowo, ale sprawiedliwie');
expect(COACH_SYSTEM_PROMPT).toContain('Brak danych oznacza brak danych');
expect(COACH_SYSTEM_PROMPT).toContain('bez dodatkowego potwierdzenia');
expect(COACH_SYSTEM_PROMPT).toContain('Nie diagnozuj');
```

- [ ] **Step 2: Write privacy/context RED tests**

Seed `rawProviderDataJson` with fake GPS/secret strings. Assert normalized context includes allowed health values but serialized context does not contain raw payload, coordinates, tokens or headers.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @qnd-health/api test -- coach-prompt.test.ts coach-context.test.ts
```

- [ ] **Step 4: Add conversation/message models**

```prisma
model CoachConversation {
  id        String         @id @default(uuid())
  title     String?
  createdAt DateTime       @default(now())
  updatedAt DateTime       @updatedAt
  messages  CoachMessage[]
}
model CoachMessage {
  id             String   @id @default(uuid())
  conversationId String
  role           String
  content        String
  model          String?
  toolMetadata   Json?
  createdAt      DateTime @default(now())
  conversation   CoachConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId, createdAt])
}
```

- [ ] **Step 5: Implement prompt + bounded context builder**

Use approved system prompt from spec. Context includes profile, Today, steps, plans, recent activities/nutrition, recent weight/sleep/RHR/HRV, BMR/TDEE, 7/30-day progress. Explicitly omit raw provider payloads/GPS/credentials.

- [ ] **Step 6: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- coach-prompt.test.ts coach-context.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add database/prisma/schema.prisma apps/api/src/coach apps/api/src/persistence/prisma-repositories.ts apps/api/test/coach-context.test.ts apps/api/test/coach-prompt.test.ts
git commit -m "feat: add coach context and persistence"
```

---

### Task 6: DeepSeek client + allow-listed Coach tools

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/runtime.ts`
- Create: `apps/api/src/coach/deepseek.ts`
- Create: `apps/api/src/coach/tools.ts`
- Create/Test: `apps/api/test/deepseek-client.test.ts`
- Create/Test: `apps/api/test/coach-tools.test.ts`
- Modify: `.env.example`

**Produces:** `DeepSeekClient.completeTurn()`, `coachTools`, `executeCoachTool()`, DeepSeek config with default model `deepseek-chat`.

- [ ] **Step 1: Write config/provider RED tests**

Mock fetch and assert configured base URL/key/model are used server-side, API key never appears in returned errors, and missing key yields typed provider-unavailable error.

- [ ] **Step 2: Write allow-list/ambiguity RED tests**

```ts
await expect(executeCoachTool('shell', {}, actor)).rejects.toMatchObject({ code: 'unknown_tool' });
await expect(executeCoachTool('delete_nutrition', { title: 'WPC' }, actor)).resolves.toMatchObject({ needsClarification: true });
```

Seed two `WPC` entries. Exact record ID from explicit user instruction may delete and must create Coach audit metadata.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @qnd-health/api test -- deepseek-client.test.ts coach-tools.test.ts
```

- [ ] **Step 4: Implement DeepSeek HTTP client**

```ts
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  signal,
});
```

Use finite timeout with `AbortController`; redact key from errors. Defaults: `DEEPSEEK_BASE_URL=https://api.deepseek.com`, `DEEPSEEK_MODEL=deepseek-chat`.

- [ ] **Step 5: Implement fixed tool registry**

Read tools: today/progress/history/plans/activities/nutrition/profile. Write tools: plans/progress/activity/nutrition/measurement/profile/step goal. Every payload validated with Zod. No arbitrary paths/URLs/SQL.

```ts
interface CoachActorContext {
  actorType: 'coach';
  conversationId: string;
  requestId: string;
  explicitUserInstruction: boolean;
}
```

- [ ] **Step 6: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- deepseek-client.test.ts coach-tools.test.ts
pnpm typecheck
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/config.ts apps/api/src/server.ts apps/api/src/runtime.ts apps/api/src/coach apps/api/test .env.example
git commit -m "feat: add deepseek coach tools"
```

---

### Task 7: Coach conversation API + chat UI

**Files:**
- Create: `apps/api/src/coach/routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/openapi.ts`
- Create/Test: `apps/api/test/coach-api.test.ts`
- Create: `apps/web/src/CoachView.tsx`
- Create/Test: `apps/web/src/coach-view.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/insights.css`

**Produces:**
- `GET/POST /api/v1/coach/conversations`
- `GET/POST /api/v1/coach/conversations/:id/messages`
- turn response `{ message, actions }`

- [ ] **Step 1: Write API turn tests**

Test persisted user/assistant messages, a mocked tool-call round trip and action summary. Add partial failure case where one mutation succeeded before provider failure; assert audit remains and response error contains `completedActions`.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- coach-api.test.ts
```

- [ ] **Step 3: Implement Coach turn loop**

```text
persist user message
→ build context + system prompt
→ DeepSeek call
→ validate/execute allow-listed tool calls
→ append tool results
→ DeepSeek final call
→ persist assistant response + sanitized tool metadata
→ return message + action summaries
```

Set exact maximum tool rounds to `6`; round 7 returns controlled error.

- [ ] **Step 4: Write frontend RED tests**

Blank send disabled; existing conversation remains on provider error; tool actions render concise callouts; successful assistant response persists after reload.

- [ ] **Step 5: Implement `CoachView`**

Use existing Coach nav. Keep calm cockpit visual language, readable rows rather than oversized generic chat bubbles. Today Coach widget links to full chat and never fabricates an assessment when none is persisted.

- [ ] **Step 6: Verify GREEN**

```bash
pnpm --filter @qnd-health/api test -- coach-api.test.ts
pnpm --filter @qnd-health/web test -- coach-view.test.ts
pnpm typecheck
pnpm build
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/coach apps/api/src/app.ts apps/api/src/runtime.ts apps/api/src/openapi.ts apps/api/test/coach-api.test.ts apps/web/src
git commit -m "feat: add deepseek coach chat"
```

---

### Task 8: OpenAPI, Hermes correction flow and deployment verification

**Files:**
- Modify: `apps/api/src/openapi.ts`
- Modify/Test: `apps/api/test/openapi.test.ts`
- Modify/Test: `apps/api/test/native-config.test.ts`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `.env.example`

**Produces:** final discoverable contracts and Debian LXC deployment instructions.

- [ ] **Step 1: Add OpenAPI assertions**

```ts
expect(doc.paths['/api/v1/nutrition/{id}'].patch).toBeDefined();
expect(doc.paths['/api/v1/nutrition/{id}'].delete).toBeDefined();
expect(doc.paths['/api/v1/profile'].get).toBeDefined();
expect(doc.paths['/api/v1/profile'].patch).toBeDefined();
expect(doc.paths['/api/v1/coach/conversations/{id}/messages'].post).toBeDefined();
```

Assert nutrition create does not require `consumedAt`/`mealType`; health schema advertises new Garmin metrics.

- [ ] **Step 2: Run OpenAPI tests**

```bash
pnpm --filter @qnd-health/api test -- openapi.test.ts
```

Fix any missing contract until GREEN.

- [ ] **Step 3: Document DeepSeek and LXC deployment**

Add to `.env.example`:

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

Update `docs/DEPLOYMENT.md` with DB backup → `prisma:generate` → `prisma:push` → build → service restart. Update README/OpenAPI notes so Hermes knows nutrition corrections are now PATCH/DELETE operations.

- [ ] **Step 4: Run full verification**

```bash
pnpm --filter @qnd-health/api prisma:generate
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:runtime
pnpm smoke:native
docker build -t qnd-health-ci .
```

Every command must exit 0.

- [ ] **Step 5: Run acceptance checklist against production-like temporary DB**

```text
1. Kroki always visible with provider/profile/7500 precedence.
2. Pompki records repetitions and completes.
3. Wiszenie records seconds and completes.
4. Rower records minutes, can complete manually, and later accept Garmin attachment.
5. Nutrition has no visible time/type/completeness captions.
6. Nutrition values have human precision.
7. Nutrition edit/delete works in UI and API.
8. Profile computes BMR/TDEE; top strip shows TDEE instead of Body Battery.
9. VO2max/provider BMR/floors-down persist from Garmin/HA ingestion.
10. Coach answers in Polish from normalized context.
11. Explicit unambiguous Coach mutation executes immediately and reports it.
12. Ambiguous destructive target asks instead of guessing.
13. No DeepSeek key/raw Garmin payload/GPS leaks to browser or tool metadata.
14. Partial provider failure truthfully reports already-completed actions.
```

- [ ] **Step 6: Commit docs/contracts**

```bash
git add apps/api/src/openapi.ts apps/api/test/openapi.test.ts apps/api/test/native-config.test.ts README.md docs/DEPLOYMENT.md .env.example
git commit -m "docs: finalize coach and health cockpit slice"
```

- [ ] **Step 7: Verify final branch CI**

Wait for GitHub Actions on final HEAD. Confirm tests, typecheck, build, runtime smoke, native SQLite smoke and Docker build are all green before giving LXC deployment commands.
