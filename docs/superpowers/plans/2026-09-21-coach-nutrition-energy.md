# QND Health Coach, Nutrition and Energy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend QND Health with editable nutrition, permanent steps and quick activity logging, BMR/TDEE/profile support, richer Garmin ingestion, and an action-capable DeepSeek Coach chat.

**Architecture:** Keep all writes behind the existing Fastify/domain/repository boundaries. Today remains a composed read model; new profile/energy helpers feed it without duplicating provider data. DeepSeek runs server-side only and may call a fixed allow-list of internal application tools that reuse the same validation/audit semantics as REST routes.

**Tech Stack:** Node 22, TypeScript, Fastify 5, Prisma 7 + SQLite, React 19/Vite, Vitest, Zod, DeepSeek OpenAI-compatible chat API.

**Spec:** `docs/superpowers/specs/2026-09-21-coach-nutrition-energy-design.md`

## Global Constraints

- User-facing UI is Polish.
- Missing health/nutrition data stays `null`/unknown and is never silently converted to zero.
- Garmin data ingested through Home Assistant keeps `source=garmin` and `transport=home_assistant`.
- Default step goal fallback is exactly `7500` when neither provider nor profile supplies a goal.
- Phase-1 BMR uses Mifflin-St Jeor; Phase-1 TDEE is `BMR × activityFactor`.
- Initial `activityFactor` default is exactly `1.2` and must be visible/editable in Settings.
- DeepSeek credentials stay server-side; browser never calls DeepSeek directly.
- DeepSeek may execute only allow-listed QND Health tools and may not run arbitrary HTTP, SQL, shell, or arbitrary endpoint calls.
- Explicit unambiguous user commands are executed immediately; ambiguous commands ask one focused question; Coach-originated destructive/significant proposals require presentation before execution.
- Coach receives normalized summaries, never raw Garmin/Home Assistant payload dumps or GPS tracks by default.
- Existing full CI gates remain required: tests, typecheck, production build, runtime smoke, native SQLite smoke, Docker compatibility build.

## Review Focus

1. **Floating-point nutrition artifacts:** values such as `120.600000000001` must render as `120,6`, while `53.0` renders as `53`; add formatter tests in Task 1.
2. **Provider/user step-goal precedence:** Garmin `stepsGoal=0`, missing/invalid provider goal, and missing profile must resolve safely to profile/default `7500`; add read-model tests in Task 2.
3. **Date-of-birth edge cases:** birthday today, tomorrow, leap-day birth date, and future DOB must not yield an invalid BMR; add energy/profile tests in Task 3.
4. **Coach tool ambiguity/idempotency:** two nutrition entries with the same title and explicit destructive user wording must not cause a guessed deletion; add tool-resolution tests in Task 6.
5. **Partial DeepSeek/tool failures:** if one tool call succeeds and the provider fails afterward, persisted actions must remain auditable and the API must report completed actions without pretending the whole turn was rolled back; add route/provider failure tests in Task 7.

---

## File Structure

### Backend additions

- `apps/api/src/profile/repository.ts` — single-user profile contract.
- `apps/api/src/profile/routes.ts` — profile GET/PATCH API.
- `apps/api/src/profile/energy.ts` — age, BMR, TDEE calculations and provenance.
- `apps/api/src/coach/system-prompt.ts` — canonical Polish Coach prompt.
- `apps/api/src/coach/context.ts` — normalized bounded model context builder.
- `apps/api/src/coach/repository.ts` — conversation/message persistence interfaces.
- `apps/api/src/coach/deepseek.ts` — provider client abstraction and HTTP implementation.
- `apps/api/src/coach/tools.ts` — allow-listed tool schemas/execution boundary.
- `apps/api/src/coach/routes.ts` — chat/conversation HTTP API.

### Backend modifications

- `database/prisma/schema.prisma` — profile, extra DailyHealth fields, Coach conversation/message fields.
- `apps/api/src/persistence/prisma-repositories.ts` — persistence implementations for profile, new health fields, Coach conversations/messages.
- `apps/api/src/app.ts`, `apps/api/src/runtime.ts`, `apps/api/src/server.ts`, `apps/api/src/config.ts` — wire profile/Coach dependencies and DeepSeek config.
- `apps/api/src/nutrition/routes.ts` — optional create metadata + PATCH/DELETE.
- `apps/api/src/health/repository.ts`, `apps/api/src/health/routes.ts` — richer Garmin metrics.
- `apps/api/src/today/routes.ts` — step-goal/energy read model.
- `apps/api/src/openapi.ts` — new/changed contracts.
- `packages/activity-model/src/*` as needed — permit manually completed activity-link workouts while preserving later Garmin attachment.

### Frontend additions

- `apps/web/src/NutritionEntryDialog.tsx` — edit nutrition entry.
- `apps/web/src/activity-presets.ts` — quick-add preset definitions/builders.
- `apps/web/src/ProfileSettings.tsx` — profile/BMR/TDEE settings editor.
- `apps/web/src/CoachView.tsx` — dedicated chat view.
- `apps/web/src/format-number.ts` — Polish compact numeric formatting.

### Frontend modifications

- `apps/web/src/App.tsx` — Today Activity/Nutrition/metric strip and Coach navigation rendering.
- `apps/web/src/api.ts` — nutrition/profile/Coach endpoints.
- `apps/web/src/types.ts` — new Today/profile/nutrition/Coach types.
- `apps/web/src/SettingsView.tsx` — Health Profile section.
- `apps/web/src/features.css`, `apps/web/src/insights.css` — quick-add/editor/chat styles.

---

### Task 1: Nutrition CRUD and compact presentation

**Files:**
- Modify: `apps/api/src/nutrition/routes.ts`
- Modify: `apps/api/src/nutrition/repository.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/App.tsx`
- Create: `apps/web/src/NutritionEntryDialog.tsx`
- Create: `apps/web/src/format-number.ts`
- Test: `apps/api/test/nutrition-api.test.ts`
- Create/Test: `apps/web/src/format-number.test.ts`

**Interfaces:**
- Produces: `PATCH /api/v1/nutrition/:id`, `DELETE /api/v1/nutrition/:id`.
- Produces: `formatMetric(value: number | null, maximumFractionDigits = 1): string`.
- Produces: `QndHealthApi.updateNutrition(id, patch)` and `QndHealthApi.deleteNutrition(id)`.

- [ ] **Step 1: Add failing backend CRUD/default tests**

Add cases equivalent to:

```ts
it('defaults missing consumedAt and mealType and allows later correction/deletion', async () => {
  const created = await authorized.inject({
    method: 'POST', url: '/api/v1/nutrition',
    payload: { title: 'Owsianka', caloriesKcal: 420 },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json().mealType).toBe('other');
  expect(Date.parse(created.json().consumedAt)).not.toBeNaN();

  const id = created.json().id;
  const edited = await authorized.inject({
    method: 'PATCH', url: `/api/v1/nutrition/${id}`,
    payload: { caloriesKcal: 390, proteinGrams: 31.2 },
  });
  expect(edited.statusCode).toBe(200);
  expect(edited.json()).toMatchObject({ caloriesKcal: 390, proteinGrams: 31.2 });

  expect((await authorized.inject({ method: 'DELETE', url: `/api/v1/nutrition/${id}` })).statusCode).toBe(204);
});
```

Also assert unknown IDs return 404 and malformed/negative nutrients return 422.

- [ ] **Step 2: Run backend RED**

Run:

```bash
pnpm --filter @qnd-health/api test -- nutrition-api.test.ts
```

Expected: failures for optional create metadata and missing PATCH/DELETE routes.

- [ ] **Step 3: Implement nutrition API changes**

Use schemas with optional metadata:

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

Default `consumedAt` on the server using the current instant; default `mealType='other'`. Add partial PATCH schema, route-level 404 handling, safe-write/audit actions `nutrition.update` and `nutrition.delete`, and OpenAPI schemas.

- [ ] **Step 4: Add failing frontend formatter/presentation tests**

Create tests equivalent to:

```ts
expect(formatMetric(120.600000000001)).toBe('120,6');
expect(formatMetric(53)).toBe('53');
expect(formatMetric(null)).toBe('—');
```

Add a render/helper assertion that nutrition macro presentation contains no `Dane kompletne`/`Brak części danych` caption.

- [ ] **Step 5: Implement UI edit/delete and simplified list**

Implement `NutritionEntryDialog` with title, kcal, B/W/T/błonnik, quantity and notes. In Today remove visible time, meal-type label and completeness captions; render macros through `formatMetric`. Wire compact Edit/Delete controls and reload Today after successful mutation.

- [ ] **Step 6: Run Task 1 GREEN**

Run:

```bash
pnpm --filter @qnd-health/api test -- nutrition-api.test.ts
pnpm --filter @qnd-health/web test -- format-number.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 7: Commit Task 1**

```bash
git add apps/api/src/nutrition apps/api/src/persistence/prisma-repositories.ts apps/api/src/openapi.ts apps/api/test/nutrition-api.test.ts apps/web/src
git commit -m "feat: make nutrition editable"
```

---

### Task 2: Permanent steps row and quick activity presets

**Files:**
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/health/repository.ts`
- Modify: `apps/api/src/health/routes.ts`
- Modify: `apps/api/src/today/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `packages/activity-model/src/plan-item.ts` or the existing progress implementation file discovered during execution
- Modify: `apps/api/src/plans/routes.ts`
- Create: `apps/web/src/activity-presets.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Test: `apps/api/test/today-api.test.ts`
- Test: `apps/api/test/garmin-ha-ingestion-api.test.ts`
- Test: `packages/activity-model/test/plan-item.test.ts`
- Create/Test: `apps/web/src/activity-presets.test.ts`

**Interfaces:**
- Produces: optional `DailyHealth.stepsGoal: number | null`.
- Produces Today `activity.steps = { current, target, goalSource }`.
- Produces: `activityPresets` configuration for `pushups`, `hang`, `stationary_bike`.
- Extends progress semantics so an `activity_link` workout can be manually marked completed and still later accept an activity attachment.

- [ ] **Step 1: Write failing step-goal precedence tests**

Cover:

```ts
expect(resolveTarget({ providerGoal: 9000, profileGoal: 8000 })).toEqual({ target: 9000, source: 'garmin' });
expect(resolveTarget({ providerGoal: null, profileGoal: 8000 })).toEqual({ target: 8000, source: 'profile' });
expect(resolveTarget({ providerGoal: 0, profileGoal: null })).toEqual({ target: 7500, source: 'fallback' });
```

At route level assert Today always returns a steps model even with zero plans.

- [ ] **Step 2: Run RED for Today/ingestion**

```bash
pnpm --filter @qnd-health/api test -- today-api.test.ts garmin-ha-ingestion-api.test.ts
```

Expected: missing `stepsGoal` ingestion/read model failures.

- [ ] **Step 3: Add `stepsGoal` schema/persistence/ingestion**

Add `stepsGoal Float?` to `DailyHealth`, accept it in `PUT /api/v1/health/daily/:date`, map in Prisma repository, and return it in Today.

Create a pure resolver in `apps/api/src/today/step-goal.ts`:

```ts
export function resolveStepGoal(providerGoal: number | null | undefined, profileGoal: number | null | undefined) {
  if (providerGoal != null && providerGoal > 0) return { target: Math.round(providerGoal), source: 'garmin' as const };
  if (profileGoal != null && profileGoal > 0) return { target: Math.round(profileGoal), source: 'profile' as const };
  return { target: 7500, source: 'fallback' as const };
}
```

Until Task 3 profile wiring lands, pass `null` as profile goal; Task 3 replaces that with repository data.

- [ ] **Step 4: Write failing manual-completion-plus-link test for stationary bike**

Pin the semantic requirement:

```ts
const manuallyDone = calculatePlanProgress({
  strategy: 'activity_link', targetValue: null, currentValue: null,
  linkedActivityId: null, manualCompleted: true,
});
expect(manuallyDone.status).toBe('completed');
```

Also verify later adding `linkedActivityId` remains completed and does not create a second plan record.

- [ ] **Step 5: Implement compatible progress semantics**

Generalize `manualCompleted` handling so `activity_link` may be completed from explicit manual progress while still preferring a linked provider activity when present. Keep existing automatic candidate matching untouched.

- [ ] **Step 6: Add failing preset builder tests**

```ts
expect(buildPresetPlan('pushups', '2026-09-21', 20)).toMatchObject({
  title: 'Pompki', kind: 'count_goal', completionStrategy: 'count_manual', targetValue: 20, unit: 'powt.'
});
expect(buildPresetPlan('hang', '2026-09-21', 45)).toMatchObject({ title: 'Wiszenie na drążku', targetValue: 45, unit: 's' });
expect(buildPresetPlan('stationary_bike', '2026-09-21', 30)).toMatchObject({
  title: 'Rower stacjonarny', kind: 'workout', completionStrategy: 'activity_link', activityType: 'indoor_cycling', plannedDurationSeconds: 1800
});
expect(() => buildPresetPlan('pushups', '2026-09-21', 0)).toThrow();
```

- [ ] **Step 7: Implement preset UI**

Define presets as data:

```ts
export const activityPresets = [
  { id: 'pushups', label: 'Pompki', inputUnit: 'powt.', tracking: 'count' },
  { id: 'hang', label: 'Wiszenie na drążku', inputUnit: 's', tracking: 'count' },
  { id: 'stationary_bike', label: 'Rower stacjonarny', inputUnit: 'min', tracking: 'duration', activityType: 'indoor_cycling' },
] as const;
```

Render three compact input rows/cards in Activity below steps. On submit, create the normal plan item then immediately call `updateProgress` to mark the entered value completed; for stationary bike mark explicit completion while keeping attachment candidates enabled.

- [ ] **Step 8: Run Task 2 GREEN and schema smoke**

```bash
pnpm --filter @qnd-health/activity-model test
pnpm --filter @qnd-health/api test -- today-api.test.ts garmin-ha-ingestion-api.test.ts
pnpm --filter @qnd-health/web test -- activity-presets.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

Expected: all pass.

- [ ] **Step 9: Commit Task 2**

```bash
git add database/prisma/schema.prisma packages/activity-model apps/api/src apps/api/test apps/web/src
git commit -m "feat: add permanent steps and quick activities"
```

---

### Task 3: Health Profile, BMR and TDEE

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

**Interfaces:**
- Produces `HealthProfileRecord { dateOfBirth, sexForBmr, heightCm, activityFactor, defaultStepsGoal }`.
- Produces `calculateBmr(profile, weightKg, onDate)` and `calculateTdee(bmr, activityFactor)`.
- Produces `GET /api/v1/profile`, `PATCH /api/v1/profile`.
- Extends Today with `energy: { bmrKcal, tdeeKcal, source: 'mifflin_st_jeor', activityFactor } | null`.

- [ ] **Step 1: Write failing energy formula/profile tests**

Include male/female formula fixtures and date edges:

```ts
expect(calculateAge('1990-09-21', '2026-09-21')).toBe(36);
expect(calculateAge('1990-09-22', '2026-09-21')).toBe(35);
expect(() => calculateAge('2030-01-01', '2026-09-21')).toThrow();
expect(calculateTdee(2000, 1.2)).toBe(2400);
```

For a leap-day DOB, define age by normal calendar anniversary semantics and assert a finite non-negative age.

- [ ] **Step 2: Run RED**

```bash
pnpm --filter @qnd-health/api test -- profile-energy.test.ts
```

Expected: module/functions/routes missing.

- [ ] **Step 3: Add Prisma profile model and repository**

Use a single-row shape with fixed ID:

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

Repository exposes `get(): Promise<HealthProfileRecord | null>` and `upsert(patch): Promise<HealthProfileRecord>`.

- [ ] **Step 4: Implement validated profile routes and pure energy helpers**

PATCH validation:

```ts
const profilePatchSchema = z.object({
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  sexForBmr: z.enum(['male','female']).nullable().optional(),
  heightCm: z.number().positive().max(260).nullable().optional(),
  activityFactor: z.number().min(1).max(3).optional(),
  defaultStepsGoal: z.number().int().min(1).max(100000).optional(),
});
```

Reject future DOB with 422. Audit updates as `profile.update`.

- [ ] **Step 5: Wire profile into Today step-goal and energy**

Fetch profile in Today composition. Resolve target order provider → profile → 7500. Compute energy only when profile fields and latest weight exist; otherwise `energy=null`. Replace Body Battery in the default top strip with TDEE, label `szacowane`, keep Body Battery stored elsewhere.

- [ ] **Step 6: Add Settings editor**

`ProfileSettings` loads/saves DOB, BMR sex basis, height, activity factor, default step goal. Explain activity factor and show computed BMR/TDEE preview only when inputs are sufficient.

- [ ] **Step 7: Run Task 3 GREEN**

```bash
pnpm --filter @qnd-health/api test -- profile-energy.test.ts today-api.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
pnpm build
```

Expected: pass.

- [ ] **Step 8: Commit Task 3**

```bash
git add database/prisma/schema.prisma apps/api/src/profile apps/api/src/persistence apps/api/src/app.ts apps/api/src/runtime.ts apps/api/src/today apps/api/src/openapi.ts apps/api/test apps/web/src
git commit -m "feat: add health profile and energy estimates"
```

---

### Task 4: Richer Garmin/Home Assistant metrics

**Files:**
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/health/repository.ts`
- Modify: `apps/api/src/health/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/openapi.ts`
- Modify/Test: `apps/api/test/garmin-ha-ingestion-api.test.ts`
- Modify: `apps/web/src/types.ts`

**Interfaces:**
- Produces normalized DailyHealth fields: `floorsDescended`, `vo2Max`, `providerBmrKcal`, plus existing `stepsGoal`.
- Preserves less mature provider values in `readinessMetricsJson`/`rawProviderDataJson` instead of inventing unrelated columns.

- [ ] **Step 1: Add failing ingestion tests**

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

Expected: new fields rejected/ignored.

- [ ] **Step 3: Add schema/repository/route fields**

Add nullable floats to Prisma and typed repository contracts. Extend health payload Zod schema with non-negative finite numbers. Continue preserving `source=garmin`, `transport=home_assistant`.

- [ ] **Step 4: Run Task 4 GREEN**

```bash
pnpm --filter @qnd-health/api test -- garmin-ha-ingestion-api.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

Expected: pass.

- [ ] **Step 5: Commit Task 4**

```bash
git add database/prisma/schema.prisma apps/api/src/health apps/api/src/persistence/prisma-repositories.ts apps/api/src/openapi.ts apps/api/test/garmin-ha-ingestion-api.test.ts apps/web/src/types.ts
git commit -m "feat: ingest richer garmin metrics"
```

---

### Task 5: Coach persistence, context builder and canonical prompt

**Files:**
- Modify: `database/prisma/schema.prisma`
- Create: `apps/api/src/coach/repository.ts`
- Create: `apps/api/src/coach/system-prompt.ts`
- Create: `apps/api/src/coach/context.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Create/Test: `apps/api/test/coach-context.test.ts`
- Create/Test: `apps/api/test/coach-prompt.test.ts`

**Interfaces:**
- Produces `COACH_SYSTEM_PROMPT: string`.
- Produces `buildCoachContext(deps, conversationId, localDate): Promise<CoachContext>`.
- Produces conversation/message repository operations `createConversation`, `listConversations`, `listMessages`, `appendMessage`.

- [ ] **Step 1: Write failing prompt policy tests**

Assert prompt includes semantic anchors, not exact snapshot:

```ts
expect(COACH_SYSTEM_PROMPT).toContain('surowo, ale sprawiedliwie');
expect(COACH_SYSTEM_PROMPT).toContain('Brak danych oznacza brak danych');
expect(COACH_SYSTEM_PROMPT).toContain('wykonaj je bez dodatkowego potwierdzenia');
expect(COACH_SYSTEM_PROMPT).toContain('Nie diagnozuj');
```

- [ ] **Step 2: Write failing context privacy tests**

Seed health with `rawProviderDataJson` containing GPS/provider secrets and assert context contains normalized values but serialized context does not contain keys/coordinates/raw payload strings.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @qnd-health/api test -- coach-prompt.test.ts coach-context.test.ts
```

Expected: modules missing.

- [ ] **Step 4: Add conversation/message Prisma models**

Use focused persistence:

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

- [ ] **Step 5: Implement canonical prompt and normalized context**

Copy the approved prompt intent from the spec into one server source file. Context builder returns only bounded fields such as current profile/steps/energy, Today summary, 7/30-day progress, recent plans/activities/nutrition/weight trends. Explicitly omit `rawProviderDataJson`, GPS and credentials.

- [ ] **Step 6: Run Task 5 GREEN**

```bash
pnpm --filter @qnd-health/api test -- coach-prompt.test.ts coach-context.test.ts
pnpm --filter @qnd-health/api prisma:generate
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit Task 5**

```bash
git add database/prisma/schema.prisma apps/api/src/coach apps/api/src/persistence/prisma-repositories.ts apps/api/test/coach-*.test.ts
git commit -m "feat: add coach context and persistence"
```

---

### Task 6: DeepSeek client and allow-listed Coach tools

**Files:**
- Modify: `apps/api/src/config.ts`
- Modify: `apps/api/src/server.ts`
- Modify: `apps/api/src/runtime.ts`
- Create: `apps/api/src/coach/deepseek.ts`
- Create: `apps/api/src/coach/tools.ts`
- Create/Test: `apps/api/test/coach-tools.test.ts`
- Create/Test: `apps/api/test/deepseek-client.test.ts`
- Modify: `.env.example` or the active generic env example in the branch

**Interfaces:**
- Produces config: `deepseekApiKey?: string`, `deepseekModel: string`, `deepseekBaseUrl: string`.
- Produces `DeepSeekClient.completeTurn(input): Promise<DeepSeekTurn>`.
- Produces `coachTools: ToolDefinition[]` and `executeCoachTool(name, args, actor): Promise<ToolResult>`.

- [ ] **Step 1: Add failing config/provider tests**

Use a mocked fetch to verify request goes to configured base URL with server-side key and model, and no key is exposed in returned/loggable payloads. Missing key must yield a typed `CoachProviderUnavailableError`.

- [ ] **Step 2: Add failing allow-list/ambiguity tests**

Pin these behaviors:

```ts
await expect(executeCoachTool('shell', {}, actor)).rejects.toMatchObject({ code: 'unknown_tool' });
await expect(executeCoachTool('delete_nutrition', { title: 'WPC' }, actor)).resolves.toMatchObject({ needsClarification: true });
```

Seed two `WPC` entries so deletion by non-unique title cannot guess. Deletion by exact ID from an explicit user command succeeds and audits actor=`coach`.

- [ ] **Step 3: Run RED**

```bash
pnpm --filter @qnd-health/api test -- deepseek-client.test.ts coach-tools.test.ts
```

Expected: missing modules/config.

- [ ] **Step 4: Implement DeepSeek HTTP client**

Use the OpenAI-compatible chat-completions shape with configurable defaults:

```ts
const response = await fetch(`${baseUrl}/chat/completions`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
  signal,
});
```

Never include key in thrown errors. Use a finite timeout with `AbortController`.

- [ ] **Step 5: Implement tool registry over domain services**

Allow exactly the spec tools: read Today/progress/history/plans/activities/nutrition/profile and write plan/progress/activity/nutrition/measurement/profile/step goal. Validate every tool payload with Zod before calling repositories/services. No tool accepts arbitrary URL/path/SQL.

For explicit mutation actor context use:

```ts
interface CoachActorContext {
  actorType: 'coach';
  conversationId: string;
  requestId: string;
  explicitUserInstruction: boolean;
}
```

- [ ] **Step 6: Run Task 6 GREEN**

```bash
pnpm --filter @qnd-health/api test -- deepseek-client.test.ts coach-tools.test.ts
pnpm typecheck
```

Expected: pass.

- [ ] **Step 7: Commit Task 6**

```bash
git add apps/api/src/config.ts apps/api/src/server.ts apps/api/src/runtime.ts apps/api/src/coach apps/api/test .env.example
git commit -m "feat: add deepseek coach tools"
```

---

### Task 7: Coach chat API and Polish chat UI

**Files:**
- Create: `apps/api/src/coach/routes.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/src/openapi.ts`
- Create/Test: `apps/api/test/coach-api.test.ts`
- Create: `apps/web/src/CoachView.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/insights.css`
- Create/Test: `apps/web/src/coach-view.test.ts`

**Interfaces:**
- Produces `GET/POST /api/v1/coach/conversations`.
- Produces `GET/POST /api/v1/coach/conversations/:id/messages`.
- Message response: `{ message, actions: Array<{ tool, entityType?, entityId?, summary }> }`.

- [ ] **Step 1: Write failing API conversation/turn tests**

Test create/list conversation, persisted user/assistant messages, one mocked tool-call round-trip, and explicit action summary.

Also test partial failure:

```ts
expect(result.statusCode).toBe(502);
expect(await audit.list()).toContainEqual(expect.objectContaining({ action: 'nutrition.update' }));
expect(result.json().error.details.completedActions).toHaveLength(1);
```

This pins that completed writes remain truthful/auditable if DeepSeek fails after a tool call.

- [ ] **Step 2: Run backend RED**

```bash
pnpm --filter @qnd-health/api test -- coach-api.test.ts
```

Expected: missing routes.

- [ ] **Step 3: Implement Coach turn loop**

Sequence:

```text
persist user message
→ build normalized context + system prompt
→ call DeepSeek
→ if tool calls: validate/execute allow-listed tools, collect action summaries
→ append tool results to model messages
→ call DeepSeek for final assistant text
→ persist assistant message + sanitized tool metadata
→ return assistant message + actions
```

Limit tool rounds (for example max 6) to prevent loops; exceeding the limit returns a controlled provider/tool error.

- [ ] **Step 4: Add failing frontend chat tests**

Assert messages render, send is disabled for blank input, performed actions render as concise callouts, and provider errors do not erase existing conversation.

- [ ] **Step 5: Implement `CoachView` and Today Coach link**

Use existing `Coach` nav item for full view. Keep UI consistent with cockpit style rather than generic oversized bubbles. Today compact widget links into Coach and may show a short latest assessment if available; it must not fabricate one when none exists.

- [ ] **Step 6: Run Task 7 GREEN**

```bash
pnpm --filter @qnd-health/api test -- coach-api.test.ts
pnpm --filter @qnd-health/web test -- coach-view.test.ts
pnpm typecheck
pnpm build
```

Expected: pass.

- [ ] **Step 7: Commit Task 7**

```bash
git add apps/api/src/coach apps/api/src/app.ts apps/api/src/runtime.ts apps/api/src/openapi.ts apps/api/test/coach-api.test.ts apps/web/src
git commit -m "feat: add deepseek coach chat"
```

---

### Task 8: OpenAPI, Hermes correction flow, migration/deployment verification

**Files:**
- Modify: `apps/api/src/openapi.ts`
- Modify: `README.md`
- Modify: `docs/DEPLOYMENT.md` if present on branch; otherwise update the existing deployment document named by the repository
- Modify: `.env.example` or current generic env example
- Modify/Test: `apps/api/test/openapi.test.ts`
- Modify/Test: `apps/api/test/native-config.test.ts`

**Interfaces:**
- Final public contracts discoverable from `GET /api/openapi.json`.
- Deployment requires schema push because profile/Coach/health columns add SQLite schema.

- [ ] **Step 1: Add failing OpenAPI coverage assertions**

Assert paths exist:

```ts
expect(doc.paths['/api/v1/nutrition/{id}'].patch).toBeDefined();
expect(doc.paths['/api/v1/nutrition/{id}'].delete).toBeDefined();
expect(doc.paths['/api/v1/profile'].get).toBeDefined();
expect(doc.paths['/api/v1/profile'].patch).toBeDefined();
expect(doc.paths['/api/v1/coach/conversations/{id}/messages'].post).toBeDefined();
```

Assert nutrition create does not require `consumedAt`/`mealType` and health daily schema advertises the new Garmin fields.

- [ ] **Step 2: Run OpenAPI RED if any contract is still missing**

```bash
pnpm --filter @qnd-health/api test -- openapi.test.ts
```

Expected before final docs completion: any omitted contract fails.

- [ ] **Step 3: Complete OpenAPI and deployment docs**

Document server env keys without values:

```env
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=<chosen deployment model>
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

Document LXC update order including backup + `prisma:push`, then service restart. Explain Hermes can now PATCH/DELETE nutrition and should stop treating corrections as impossible.

- [ ] **Step 4: Run full verification**

Run exactly:

```bash
pnpm --filter @qnd-health/api prisma:generate
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:runtime
pnpm smoke:native
docker build -t qnd-health-ci .
```

Expected: every command exits 0.

- [ ] **Step 5: Manual acceptance checklist against production-like runtime**

Using a temporary/local SQLite database and test token, verify:

```text
1. Today shows Kroki even with no plan rows.
2. Provider step target wins; otherwise profile target; otherwise 7500.
3. Pompki accepts repetitions and records completion.
4. Wiszenie accepts seconds and records completion.
5. Rower accepts minutes, records manual completion, and later permits Garmin attachment.
6. Nutrition displays no time/type/completeness captions.
7. Nutrition macros are rounded human-readably.
8. Nutrition edit/delete works from UI and API.
9. Settings profile computes BMR/TDEE and Today shows TDEE instead of Body Battery.
10. Garmin VO2max/BMR/floors-down ingestion persists.
11. Coach answers in Polish using normalized context.
12. Explicit Coach command changes data immediately and reports action.
13. Ambiguous/destructive target with multiple matches asks rather than guesses.
14. No DeepSeek key/raw Garmin dump/GPS is returned to browser or stored in tool metadata.
```

- [ ] **Step 6: Update draft PR description and commit final docs/tests**

```bash
git add apps/api/src/openapi.ts apps/api/test README.md docs .env.example
git commit -m "docs: finalize coach and health cockpit slice"
```

- [ ] **Step 7: Verify branch CI from the final commit before deployment**

Wait for the GitHub Actions CI associated with the final HEAD and confirm test/typecheck/build/runtime/native/Docker steps are all green. Do not give deployment instructions until this fresh run succeeds.
