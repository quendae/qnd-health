# Versioned Goals & Coach Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile goals historically versioned by effective date, expose carbs/fat/fiber targets, give Coach authoritative demographic/goal context and date-aware mutation tools, refresh the UI after Coach changes, add a cached daily Coach review, and ship a branded favicon without changing the existing single-user deployment model.

**Architecture:** Add a dedicated `ProfileGoalRevision` snapshot stream and one resolver service used by Profile, Today, Progress and Coach. Keep `HealthProfile` for demographic data and deprecated compatibility values, while all date-sensitive reads resolve through the new service. The frontend continues using the existing API client, but Settings and Coach refresh paths become revision-aware; daily Coach review is a separate read-only cached flow over deterministic stats plus DeepSeek text.

**Tech Stack:** TypeScript, Fastify 5, Prisma 7 + SQLite, React + Vite, Vitest, existing DeepSeek client, existing `update.sh` deployment flow.

**Spec:** `docs/superpowers/specs/2026-09-21-versioned-goals-coach-dashboard-design.md`

## Global Constraints

- Goal effective dates use local calendar dates in `Europe/Warsaw`; no intra-day goal changes.
- Versioned fields: `activityFactor`, `defaultStepsGoal`, `dailyCaloriesGoalKcal`, `dailyProteinGoalGrams`, `dailyCarbsGoalGrams`, `dailyFatGoalGrams`, `dailyFiberGoalGrams`.
- Demographic fields remain ordinary profile data: `dateOfBirth`, `sexForBmr`, `heightCm`.
- Initial migration baseline is `1970-01-01`.
- Same-day revisions resolve by `effectiveFrom DESC`, then `createdAt DESC`, then `id DESC`.
- Garmin `DailyHealth.stepsGoal` overrides the profile step target for that day only.
- Missing goals remain `null`; never invent macro targets.
- Daily homepage Coach review must not use Body Battery.
- Existing web and Hermes token scopes remain valid; reuse `measurements:read` / `measurements:write` for profile/goal APIs.
- `update.sh` remains the canonical production deployment command.

## Review Focus

1. **Future-dated goal revisions** — a revision effective tomorrow must not affect Today, History, Progress or Coach context until tomorrow; pin in Tasks 1, 3 and 4.
2. **Two revisions on the same day** — latest `createdAt`, then `id`, must win deterministically; pin in Task 1.
3. **Partial goal patches containing `null`** — nullable macro goals must clear only the supplied field while copying all other active values; pin in Tasks 1 and 3.
4. **Coach mutation succeeds but DeepSeek final response fails** — the persisted goal revision must remain, UI refresh must happen from `completedActions`, and no rollback is attempted; pin in Tasks 5 and 6.
5. **Daily summary provider unavailable** — Today must still render deterministic stats and a local fallback review without Body Battery; pin in Task 7.

---

### Task 1: Versioned Goal Domain and Resolver

**Files:**
- Create: `apps/api/src/profile/goal-repository.ts`
- Create: `apps/api/src/profile/goals.ts`
- Create: `apps/api/test/profile-goals.test.ts`
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`

**Interfaces:**
- Produces:
  - `ProfileGoalValues`
  - `ProfileGoalRevisionRecord`
  - `ProfileGoalRevisionRepository`
  - `ProfileGoalService.resolve(date)`
  - `ProfileGoalService.createRevision(patch, metadata)`
  - `ProfileGoalService.listRevisions()`
- Consumes existing `HealthProfileRepository` only as fallback when no revision exists.

- [ ] **Step 1: Write failing resolver tests**

Create `apps/api/test/profile-goals.test.ts` with focused in-memory repository fixtures:

```ts
import { describe, expect, it } from 'vitest';
import { ProfileGoalService } from '../src/profile/goals.js';

const base = {
  activityFactor: 1.2,
  defaultStepsGoal: 7500,
  dailyCaloriesGoalKcal: 1600,
  dailyProteinGoalGrams: 180,
  dailyCarbsGoalGrams: null,
  dailyFatGoalGrams: null,
  dailyFiberGoalGrams: null,
};

describe('ProfileGoalService', () => {
  it('keeps older days on the older revision', async () => {
    const repo = memoryGoalRepo([
      revision('a', '2026-09-01', '2026-09-01T08:00:00Z', base),
      revision('b', '2026-09-22', '2026-09-21T20:00:00Z', { ...base, dailyCaloriesGoalKcal: 1900 }),
    ]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));
    expect((await service.resolve('2026-09-21')).dailyCaloriesGoalKcal).toBe(1600);
    expect((await service.resolve('2026-09-22')).dailyCaloriesGoalKcal).toBe(1900);
  });

  it('uses the newest same-day revision deterministically', async () => {
    const repo = memoryGoalRepo([
      revision('a', '2026-09-22', '2026-09-22T08:00:00Z', base),
      revision('b', '2026-09-22', '2026-09-22T09:00:00Z', { ...base, dailyCaloriesGoalKcal: 1800 }),
      revision('c', '2026-09-22', '2026-09-22T09:00:00Z', { ...base, dailyCaloriesGoalKcal: 1850 }),
    ]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));
    expect((await service.resolve('2026-09-22')).dailyCaloriesGoalKcal).toBe(1850);
  });

  it('copies active values and only changes supplied keys, including explicit null', async () => {
    const repo = memoryGoalRepo([revision('a', '1970-01-01', '2026-09-21T00:00:00Z', base)]);
    const service = new ProfileGoalService(repo, fallbackProfileRepo(base));
    const created = await service.createRevision(
      { dailyCaloriesGoalKcal: 1900, dailyProteinGoalGrams: null },
      { effectiveFrom: '2026-09-22', source: 'manual', sourceRef: null, reason: null },
    );
    expect(created.dailyCaloriesGoalKcal).toBe(1900);
    expect(created.dailyProteinGoalGrams).toBeNull();
    expect(created.defaultStepsGoal).toBe(7500);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
pnpm --filter @qnd-health/api test -- profile-goals.test.ts
```

Expected: FAIL because `goal-repository.ts` / `goals.ts` do not exist.

- [ ] **Step 3: Add Prisma model and repository interfaces**

Add to `database/prisma/schema.prisma`:

```prisma
model ProfileGoalRevision {
  id                    String   @id @default(uuid())
  effectiveFrom         DateTime
  source                String
  sourceRef             String?
  reason                String?
  activityFactor        Float
  defaultStepsGoal      Int
  dailyCaloriesGoalKcal Int?
  dailyProteinGoalGrams Int?
  dailyCarbsGoalGrams   Int?
  dailyFatGoalGrams     Int?
  dailyFiberGoalGrams   Int?
  createdAt             DateTime @default(now())

  @@index([effectiveFrom, createdAt])
}
```

Create `apps/api/src/profile/goal-repository.ts`:

```ts
export interface ProfileGoalValues {
  activityFactor: number;
  defaultStepsGoal: number;
  dailyCaloriesGoalKcal: number | null;
  dailyProteinGoalGrams: number | null;
  dailyCarbsGoalGrams: number | null;
  dailyFatGoalGrams: number | null;
  dailyFiberGoalGrams: number | null;
}

export type GoalRevisionSource = 'manual' | 'coach' | 'migration';

export interface ProfileGoalRevisionRecord extends ProfileGoalValues {
  id: string;
  effectiveFrom: string;
  source: GoalRevisionSource;
  sourceRef: string | null;
  reason: string | null;
  createdAt: string;
}

export interface ProfileGoalRevisionRepository {
  findActiveOn(date: string): Promise<ProfileGoalRevisionRecord | null>;
  list(): Promise<ProfileGoalRevisionRecord[]>;
  count(): Promise<number>;
  create(input: Omit<ProfileGoalRevisionRecord, 'id' | 'createdAt'>): Promise<ProfileGoalRevisionRecord>;
}
```

- [ ] **Step 4: Implement the resolver/service**

Create `apps/api/src/profile/goals.ts` with this public shape:

```ts
export class ProfileGoalService {
  constructor(
    private readonly revisions: ProfileGoalRevisionRepository,
    private readonly profile: HealthProfileRepository,
  ) {}

  async resolve(date: string): Promise<ResolvedProfileGoals> { /* select active revision, else profile/default fallback */ }

  async createRevision(
    patch: Partial<ProfileGoalValues>,
    meta: { effectiveFrom: string; source: GoalRevisionSource; sourceRef: string | null; reason: string | null },
  ): Promise<ProfileGoalRevisionRecord> { /* copy active snapshot + patch + create */ }

  async listRevisions(): Promise<ProfileGoalRevisionRecord[]> { return this.revisions.list(); }
}
```

Validation rules in this module:

```ts
activityFactor > 0
defaultStepsGoal integer > 0
all macro/calorie goals: integer > 0 or null
```

Use `YYYY-MM-DD` strings at the service boundary and canonical UTC midnight `DateTime` only inside the Prisma adapter.

- [ ] **Step 5: Implement Prisma adapter**

Extend `PrismaClientPort` and `createPrismaRepositories()` in `apps/api/src/persistence/prisma-repositories.ts` with `profileGoalRevision` and a `profileGoalRevisionRepository` whose `findActiveOn(date)` executes the equivalent of:

```ts
where: { effectiveFrom: { lte: new Date(`${date}T00:00:00.000Z`) } },
orderBy: [
  { effectiveFrom: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
],
take: 1,
```

Convert `effectiveFrom` back to `YYYY-MM-DD` and `createdAt` to ISO strings in repository records.

- [ ] **Step 6: Run focused tests and typecheck**

```bash
pnpm --filter @qnd-health/api prisma:generate
pnpm --filter @qnd-health/api test -- profile-goals.test.ts
pnpm --filter @qnd-health/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add database/prisma/schema.prisma apps/api/src/profile apps/api/src/persistence/prisma-repositories.ts apps/api/test/profile-goals.test.ts
git commit -m "feat: add versioned profile goal resolver"
```

---

### Task 2: Idempotent Backfill and Deployment Integration

**Files:**
- Create: `apps/api/src/profile/backfill-goals.ts`
- Create: `apps/api/src/scripts/backfill-profile-goals.ts`
- Create: `apps/api/test/profile-goals-backfill.test.ts`
- Modify: `apps/api/package.json`
- Modify: `update.sh`

**Interfaces:**
- Consumes `ProfileGoalRevisionRepository`, `HealthProfileRepository`.
- Produces `backfillProfileGoals(...) => Promise<'created' | 'skipped'>`.

- [ ] **Step 1: Write failing idempotency test**

```ts
it('creates one 1970-01-01 migration revision and never duplicates it', async () => {
  const revisions = memoryGoalRepo([]);
  const result1 = await backfillProfileGoals(revisions, fallbackProfileRepo({
    activityFactor: 1.2,
    defaultStepsGoal: 7500,
    dailyCaloriesGoalKcal: 1600,
    dailyProteinGoalGrams: 180,
    dailyCarbsGoalGrams: null,
    dailyFatGoalGrams: null,
    dailyFiberGoalGrams: null,
  }));
  const result2 = await backfillProfileGoals(revisions, fallbackProfileRepo(/* same */));
  expect(result1).toBe('created');
  expect(result2).toBe('skipped');
  expect(await revisions.count()).toBe(1);
  expect((await revisions.list())[0]).toMatchObject({ effectiveFrom: '1970-01-01', source: 'migration' });
});
```

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- profile-goals-backfill.test.ts
```

Expected: FAIL because backfill module does not exist.

- [ ] **Step 3: Implement backfill function and CLI**

`backfillProfileGoals()` must:

```ts
if (await revisions.count() > 0) return 'skipped';
const profile = await profiles.get();
await revisions.create({
  effectiveFrom: '1970-01-01',
  source: 'migration',
  sourceRef: null,
  reason: 'Initial versioned-goals migration',
  activityFactor: profile?.activityFactor ?? 1.2,
  defaultStepsGoal: profile?.defaultStepsGoal ?? 7500,
  dailyCaloriesGoalKcal: profile?.dailyCaloriesGoalKcal ?? null,
  dailyProteinGoalGrams: profile?.dailyProteinGoalGrams ?? null,
  dailyCarbsGoalGrams: null,
  dailyFatGoalGrams: null,
  dailyFiberGoalGrams: null,
});
return 'created';
```

The CLI in `apps/api/src/scripts/backfill-profile-goals.ts` must open the same Prisma/SQLite runtime used by the app, call this function, print the result, and always disconnect.

- [ ] **Step 4: Add package script**

In `apps/api/package.json`:

```json
"goals:backfill": "pnpm prisma:generate && tsx src/scripts/backfill-profile-goals.ts"
```

- [ ] **Step 5: Wire `update.sh` after `prisma:push` and before restart**

Add:

```bash
echo "==> Backfilling versioned profile goals"
if ! pnpm --filter @qnd-health/api goals:backfill; then
  echo "ERROR: profile goal backfill failed. Service remains stopped." >&2
  [[ -n "$BACKUP_FILE" ]] && echo "Database backup: $BACKUP_FILE" >&2
  exit 1
fi
```

- [ ] **Step 6: Verify**

```bash
bash -n update.sh
pnpm --filter @qnd-health/api test -- profile-goals-backfill.test.ts
pnpm --filter @qnd-health/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/profile/backfill-goals.ts apps/api/src/scripts/backfill-profile-goals.ts apps/api/test/profile-goals-backfill.test.ts apps/api/package.json update.sh
git commit -m "feat: backfill versioned goals during updates"
```

---

### Task 3: Goal API and Backward-Compatible Profile Contract

**Files:**
- Modify: `apps/api/src/profile/routes.ts`
- Modify: `apps/api/src/profile/repository.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/src/runtime.ts`
- Modify: `apps/api/test/profile-api.test.ts`
- Create: `apps/api/test/profile-goals-api.test.ts`

**Interfaces:**
- Consumes `ProfileGoalService` from Task 1.
- Produces:
  - `GET /api/v1/profile/goals?date=YYYY-MM-DD`
  - `GET /api/v1/profile/goals/history`
  - `PATCH /api/v1/profile/goals`
  - backward-compatible `GET/PATCH /api/v1/profile`.

- [ ] **Step 1: Add RED API tests**

Cover all of these in `profile-goals-api.test.ts`:

```ts
expect((await getGoals('2026-09-21')).dailyCaloriesGoalKcal).toBe(1600);
expect((await getGoals('2026-09-22')).dailyCaloriesGoalKcal).toBe(1900);

const changed = await patchGoals({
  effectiveFrom: '2026-09-22',
  activityFactor: 1.3,
  dailyCarbsGoalGrams: 150,
  dailyFatGoalGrams: 60,
  dailyFiberGoalGrams: 30,
});
expect(changed).toMatchObject({ activityFactor: 1.3, dailyCarbsGoalGrams: 150, dailyFatGoalGrams: 60, dailyFiberGoalGrams: 30 });

const cleared = await patchGoals({ effectiveFrom: '2026-09-22', dailyCarbsGoalGrams: null });
expect(cleared.dailyCarbsGoalGrams).toBeNull();
expect(cleared.dailyFatGoalGrams).toBe(60);
```

Also extend `profile-api.test.ts` so one PATCH containing demographics + versioned goals updates demographics directly and creates exactly one revision effective today.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- profile-goals-api.test.ts profile-api.test.ts
```

Expected: FAIL on missing routes/service wiring and missing new macro fields.

- [ ] **Step 3: Split profile validation into demographic and goal schemas**

Use these explicit shapes in `profile/routes.ts`:

```ts
const demographicPatch = z.object({
  dateOfBirth: dateSchema.nullable().optional(),
  sexForBmr: z.enum(['male', 'female']).nullable().optional(),
  heightCm: z.number().positive().nullable().optional(),
});

const goalPatch = z.object({
  effectiveFrom: dateSchema.optional(),
  activityFactor: z.number().positive().optional(),
  defaultStepsGoal: z.number().int().positive().optional(),
  dailyCaloriesGoalKcal: z.number().int().positive().nullable().optional(),
  dailyProteinGoalGrams: z.number().int().positive().nullable().optional(),
  dailyCarbsGoalGrams: z.number().int().positive().nullable().optional(),
  dailyFatGoalGrams: z.number().int().positive().nullable().optional(),
  dailyFiberGoalGrams: z.number().int().positive().nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
});
```

`PATCH /profile` must split the body: demographic keys go to `HealthProfileRepository.upsert`; versioned keys go once to `ProfileGoalService.createRevision(... effective today, source='manual')`.

- [ ] **Step 4: Implement goal routes and history**

Return resolved goals including:

```ts
{
  revisionId,
  effectiveFrom,
  source,
  ...ProfileGoalValues
}
```

`GET /profile` returns demographic fields plus today's resolved goal values as flat compatibility fields.

- [ ] **Step 5: Wire service through `app.ts` and `runtime.ts`**

`buildApp()` receives `profileGoalRevisionRepository` and constructs/uses one `ProfileGoalService` instance for profile/Today/insights/Coach registration rather than each route creating its own resolver.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @qnd-health/api test -- profile-goals-api.test.ts profile-api.test.ts
pnpm --filter @qnd-health/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/profile apps/api/src/app.ts apps/api/src/runtime.ts apps/api/test/profile-api.test.ts apps/api/test/profile-goals-api.test.ts
git commit -m "feat: expose date-aware profile goal API"
```

---

### Task 4: Today, History and Progress Use Historical Goals

**Files:**
- Modify: `apps/api/src/today/routes.ts`
- Modify: `apps/api/src/today/step-goal.ts`
- Modify: `apps/api/src/insights/routes.ts`
- Modify: `apps/api/test/today-api.test.ts`
- Modify: `apps/api/test/history-progress-api.test.ts`
- Modify: `apps/web/src/types.ts`

**Interfaces:**
- Consumes `ProfileGoalService.resolve(date)`.
- Produces date-correct nutrition/macro goal fields in Today and date-correct goal series in Progress.

- [ ] **Step 1: Add RED tests for historical resolution**

Add a Today test where:

```ts
// 2026-09-21 active goal = 1600 kcal; 2026-09-22 active goal = 1900 kcal
expect((await getToday('2026-09-21')).nutrition.goals.caloriesKcal).toBe(1600);
expect((await getToday('2026-09-22')).nutrition.goals.caloriesKcal).toBe(1900);
```

Add Garmin precedence:

```ts
expect(today.activity.steps.target).toBe(9000); // Garmin day goal
expect(today.activity.steps.goalSource).toBe('garmin');
```

Add Progress assertions:

```ts
expect(series.find(p => p.date === '2026-09-21')).toMatchObject({
  caloriesGoalKcal: 1600,
  proteinGoalGrams: 180,
  carbsGoalGrams: 140,
  fatGoalGrams: 60,
  fiberGoalGrams: 30,
});
expect(series.find(p => p.date === '2026-09-22')?.caloriesGoalKcal).toBe(1900);
```

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- today-api.test.ts history-progress-api.test.ts
```

Expected: FAIL because current routes use current-profile values or static goals.

- [ ] **Step 3: Refactor Today to resolve selected-date goals once**

At request start:

```ts
const goals = await deps.profileGoalService.resolve(date);
```

Return:

```ts
nutrition: {
  goals: {
    caloriesKcal: goals.dailyCaloriesGoalKcal,
    proteinGrams: goals.dailyProteinGoalGrams,
    carbsGrams: goals.dailyCarbsGoalGrams,
    fatGrams: goals.dailyFatGoalGrams,
    fiberGrams: goals.dailyFiberGoalGrams,
  },
  ...
}
```

Update `resolveStepGoal()` to receive the resolved default step goal rather than a whole profile record:

```ts
resolveStepGoal({ garminStepsGoal: health?.stepsGoal, profileStepsGoal: goals.defaultStepsGoal, fallback: 7500 })
```

Historical energy calculation uses `goals.activityFactor`.

- [ ] **Step 4: Resolve Progress goals per calendar date**

In `insights/routes.ts`, resolve every day in the requested range with `Promise.all(days.map(date => goalService.resolve(date)))`, build a date→goals map, and use it when constructing series points.

Do not use today's goal for all points.

- [ ] **Step 5: Update web types**

In `apps/web/src/types.ts`, define explicit Today goal fields:

```ts
goals: {
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
}
```

and Progress point goal fields for all five nutrition targets plus `stepsGoal`.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @qnd-health/api test -- today-api.test.ts history-progress-api.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/today apps/api/src/insights apps/api/test/today-api.test.ts apps/api/test/history-progress-api.test.ts apps/web/src/types.ts
git commit -m "feat: resolve historical goals in today and progress"
```

---

### Task 5: Coach Gets Authoritative Demographics and Date-Aware Goal Tools

**Files:**
- Modify: `apps/api/src/coach/context.ts`
- Modify: `apps/api/src/coach/system-prompt.ts`
- Modify: `apps/api/src/coach/tools.ts`
- Modify: `apps/api/src/coach/routes.ts`
- Modify: `apps/api/test/coach-context.test.ts`
- Modify: `apps/api/test/coach-tools.test.ts`
- Modify: `apps/api/test/coach-api.test.ts`

**Interfaces:**
- Consumes `ProfileGoalService`.
- Produces explicit `update_goals` tool and demographic-only `update_profile`.

- [ ] **Step 1: Add RED context test for saved DOB and age**

For `date='2026-09-21'` and `dateOfBirth='1987-12-12'` assert:

```ts
expect(context.profile).toMatchObject({
  dateOfBirth: '1987-12-12',
  ageYears: 38,
  sexForBmr: 'male',
  heightCm: 183,
});
expect(context.goals).toMatchObject({
  activityFactor: 1.2,
  caloriesKcal: 1600,
  proteinGrams: 210,
  carbsGrams: 140,
  fatGrams: 60,
  fiberGrams: 30,
  effectiveFrom: '2026-09-01',
});
```

Assert serialized context excludes Body Battery from the homepage-summary-specific input; normal chat context may retain it only as non-primary raw health context until Task 7 removes it from summary generation.

- [ ] **Step 2: Add RED tool schema test**

```ts
const updateGoals = coachTools.find(tool => tool.function.name === 'update_goals');
expect(updateGoals?.function.parameters.properties).toMatchObject({
  effectiveFrom: expect.anything(),
  activityFactor: expect.anything(),
  defaultStepsGoal: expect.anything(),
  dailyCaloriesGoalKcal: expect.anything(),
  dailyProteinGoalGrams: expect.anything(),
  dailyCarbsGoalGrams: expect.anything(),
  dailyFatGoalGrams: expect.anything(),
  dailyFiberGoalGrams: expect.anything(),
});
```

Add execution test:

```ts
const result = await executeCoachTool('update_goals', {
  effectiveFrom: '2026-09-22',
  dailyCaloriesGoalKcal: 1900,
  reason: 'Increase after review',
}, deps, context);
expect(result).toMatchObject({ effectiveFrom: '2026-09-22', source: 'coach', dailyCaloriesGoalKcal: 1900 });
```

- [ ] **Step 3: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- coach-context.test.ts coach-tools.test.ts coach-api.test.ts
```

Expected: FAIL because DOB/age are omitted and `update_goals` is absent.

- [ ] **Step 4: Update context builder and age calculation**

Add:

```ts
function ageOn(dateOfBirth: string, date: string): number {
  const birth = new Date(`${dateOfBirth}T12:00:00Z`);
  const on = new Date(`${date}T12:00:00Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  if ([on.getUTCMonth(), on.getUTCDate()].join('-') < [birth.getUTCMonth(), birth.getUTCDate()].join('-')) age -= 1;
  return age;
}
```

Expose DOB + age + resolved goals as authoritative context values.

- [ ] **Step 5: Split Coach tools**

`update_profile` JSON schema explicitly exposes only:

```ts
{ dateOfBirth, sexForBmr, heightCm }
```

Add `update_goals` with all versioned fields and `effectiveFrom`; execution calls:

```ts
profileGoalService.createRevision(patch, {
  effectiveFrom: input.effectiveFrom ?? localToday(context.timeZone),
  source: 'coach',
  sourceRef: context.conversationId,
  reason: input.reason ?? null,
});
```

Keep `set_default_step_goal` only as a compatibility alias that creates a goal revision effective today.

- [ ] **Step 6: Strengthen prompt wording**

Add to `COACH_SYSTEM_PROMPT`:

```text
Dane profilu i cele przekazane w kontekście QND Health są autorytatywne. Nie zgaduj wieku, wzrostu, płci dla BMR ani celów, jeżeli wartości są dostępne. Zmieniając cele używaj update_goals i ustaw effectiveFrom zgodnie z intencją użytkownika.
```

- [ ] **Step 7: Verify**

```bash
pnpm --filter @qnd-health/api test -- coach-context.test.ts coach-tools.test.ts coach-api.test.ts
pnpm --filter @qnd-health/api typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/coach apps/api/test/coach-context.test.ts apps/api/test/coach-tools.test.ts apps/api/test/coach-api.test.ts
git commit -m "feat: make coach profile context and goals authoritative"
```

---

### Task 6: Settings, Macro Goals and Immediate Refresh After Coach Mutations

**Files:**
- Modify: `apps/web/src/types.ts`
- Modify: `apps/web/src/api.ts`
- Modify: `apps/web/src/profile-settings.ts`
- Modify: `apps/web/src/ProfileSettings.tsx`
- Modify: `apps/web/src/CoachView.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/SettingsView.tsx`
- Modify: `apps/web/src/features.css`
- Modify: `apps/web/src/ProfileSettings.test.tsx` if present; otherwise create `apps/web/src/profile-settings.test.ts`
- Modify: `apps/web/src/CoachView.test.tsx`

**Interfaces:**
- Consumes new Profile/Goals API and Today goal fields.
- Produces visible macro targets, effective-date copy and `onDataMutated()` refresh flow.

- [ ] **Step 1: Add RED form serialization test**

Extend the profile form state with:

```ts
dailyCarbsGoalGrams: string;
dailyFatGoalGrams: string;
dailyFiberGoalGrams: string;
```

Test:

```ts
expect(buildGoalPatch({ ...defaults, dailyCarbsGoalGrams: '150', dailyFatGoalGrams: '60', dailyFiberGoalGrams: '30' }))
  .toMatchObject({ dailyCarbsGoalGrams: 150, dailyFatGoalGrams: 60, dailyFiberGoalGrams: 30 });
```

- [ ] **Step 2: Add RED Coach refresh test**

In `CoachView.test.tsx`, render with `onDataMutated={spy}` and a mocked send response containing a completed mutating action:

```ts
{ actions: [{ name: 'update_goals', status: 'completed', result: {} }] }
```

Assert `spy` is called once. Repeat with a simulated `502` carrying `completedActions: [{ name: 'update_goals', ... }]`; assert it is still called once because the mutation succeeded before provider failure.

- [ ] **Step 3: Verify RED**

```bash
pnpm --filter @qnd-health/web test -- profile-settings.test.ts CoachView.test.tsx
```

Expected: FAIL on missing fields/callback.

- [ ] **Step 4: Add API client methods and types**

In `api.ts` add:

```ts
getGoals(date: string): Promise<ResolvedProfileGoals>
updateGoals(patch: GoalPatch): Promise<ResolvedProfileGoals>
getGoalHistory(): Promise<ProfileGoalRevision[]>
```

Extend `HealthProfile` response type with current resolved macro fields and revision metadata.

- [ ] **Step 5: Split ProfileSettings UI into profile data and current goals**

Render:

```text
Dane profilu
- data urodzenia
- płeć dla BMR
- wzrost

Aktualne cele
- współczynnik aktywności
- kroki
- kcal
- białko
- węglowodany
- tłuszcz
- błonnik
Obowiązuje od DD.MM.YYYY
```

Saving demographic changes uses `updateProfile`; saving goals uses `updateGoals({ effectiveFrom: today, ... })`. One Save button may submit both sequentially, but it must create at most one goal revision.

- [ ] **Step 6: Update Today macro cards**

In `App.tsx`, render Protein/Carbs/Fat/Fiber consistently:

```tsx
<MacroMetric value={totals.carbsGrams} goal={today.nutrition.goals.carbsGrams} unit="g" />
```

`MacroMetric` shows `consumed / goal`, one compact progress bar and `%` only when goal is non-null.

- [ ] **Step 7: Add authoritative refresh callback**

At App level:

```ts
const [profileVersion, setProfileVersion] = useState(0);
async function handleCoachDataMutated() {
  await loadToday(selectedDate);
  setProfileVersion(value => value + 1);
}
```

Pass it to `CoachView`. Pass `profileVersion` to `SettingsView/ProfileSettings` and include it in the profile-loading effect dependency so Settings re-fetches after Coach mutations.

Do not infer new values from model text.

- [ ] **Step 8: Verify**

```bash
pnpm --filter @qnd-health/web test
pnpm --filter @qnd-health/web typecheck
pnpm --filter @qnd-health/web build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/web/src
git commit -m "feat: show versioned macro goals and refresh coach changes"
```

---

### Task 7: Cached Daily Coach Review for Today

**Files:**
- Create: `apps/api/src/coach/daily-summary.ts`
- Create: `apps/api/src/coach/review-repository.ts`
- Create: `apps/api/test/coach-daily-summary.test.ts`
- Modify: `apps/api/src/coach/routes.ts`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/web/src/api.ts`
- Create: `apps/web/src/DailyCoachSummary.tsx`
- Create: `apps/web/src/DailyCoachSummary.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/features.css`

**Interfaces:**
- Produces `GET /api/v1/coach/daily-summary?date=YYYY-MM-DD`.
- Uses `CoachReview` as cache storage keyed by input hash inside `inputJson`.
- No Coach tools are exposed in this flow.

- [ ] **Step 1: Write RED backend tests**

Test deterministic stats and Body Battery exclusion:

```ts
const summary = await service.getDailySummary('2026-09-21');
expect(summary.stats.activity.stepsPercent).toBe(100);
expect(summary.stats.calories.percent).toBe(103);
expect(JSON.stringify(provider.lastInput)).not.toContain('bodyBattery');
```

Test provider failure fallback:

```ts
provider.failNext();
const summary = await service.getDailySummary('2026-09-21');
expect(summary.source).toBe('fallback');
expect(summary.verdict).toMatch(/kroki|kalorie|plan/i);
```

Test unchanged input hash calls provider once across two requests.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- coach-daily-summary.test.ts
```

Expected: FAIL because daily summary service/repository do not exist.

- [ ] **Step 3: Define review repository**

Create `review-repository.ts`:

```ts
export interface DailyCoachReviewCacheRecord {
  id: string;
  date: string;
  inputHash: string;
  output: DailyCoachSummaryResponse;
  createdAt: string;
}

export interface CoachReviewRepository {
  findDailySummary(date: string, inputHash: string): Promise<DailyCoachReviewCacheRecord | null>;
  saveDailySummary(input: { date: string; inputHash: string; input: unknown; output: DailyCoachSummaryResponse }): Promise<void>;
}
```

Implement using existing `CoachReview` rows with `reviewType='daily_summary'`, `periodStart=periodEnd=<date>`, and `inputJson={ inputHash, normalizedInput }`.

- [ ] **Step 4: Implement deterministic summary input**

`daily-summary.ts` must compute before calling DeepSeek:

```ts
activity: {
  stepsCurrent,
  stepsTarget,
  stepsPercent,
  plannedCount,
  completedCount,
}
calories: {
  consumedKcal,
  targetKcal,
  percent,
  deltaKcal,
}
progress7: {
  planCompletionPercent,
  averageSteps,
  weightDeltaKg,
}
```

Exclude Body Battery entirely.

Hash exactly the normalized deterministic input:

```ts
createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex')
```

- [ ] **Step 5: Ask DeepSeek for verdict without tools**

Use `deepseekClient.completeTurn({ messages, tools: [] })` with one focused system instruction:

```text
Napisz po polsku bardzo krótką, surową ale sprawiedliwą ocenę dnia na podstawie podanych statystyk. Zwróć 1-2 zdania werdyktu i jedną konkretną sugestię. Nie diagnozuj i nie wspominaj Body Battery.
```

If provider throws, generate a deterministic Polish fallback string from steps/calorie/plan percentages.

- [ ] **Step 6: Add route**

`GET /api/v1/coach/daily-summary?date=YYYY-MM-DD`:
- requires `coach:read`,
- validates date,
- returns stats + verdict + suggestion + `source: 'deepseek' | 'cache' | 'fallback'`.

- [ ] **Step 7: Add RED frontend test and component**

`DailyCoachSummary.test.tsx` asserts labels:

```text
Aktywność
Kalorie
Postęp 7 dni
```

and absence of `Body Battery`.

Component layout: three compact evaluation stat cards, verdict line, one suggestion, link/button to full Coach view.

- [ ] **Step 8: Replace existing homepage Coach placeholder**

In `App.tsx`, fetch daily summary when:
- selected date changes,
- Today data refreshes after mutation,
- Coach widget is visible.

A summary fetch failure must render deterministic local stat fallback rather than hide the widget.

- [ ] **Step 9: Verify**

```bash
pnpm --filter @qnd-health/api test -- coach-daily-summary.test.ts
pnpm --filter @qnd-health/web test -- DailyCoachSummary.test.tsx
pnpm typecheck
pnpm build
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/coach apps/api/src/persistence/prisma-repositories.ts apps/api/src/app.ts apps/api/test/coach-daily-summary.test.ts apps/web/src
git commit -m "feat: add cached daily coach review"
```

---

### Task 8: Favicon, OpenAPI, Deployment and Full Verification

**Files:**
- Create: `apps/web/public/favicon.svg`
- Modify: `apps/web/index.html`
- Modify: `apps/api/src/openapi.ts`
- Modify: `.env.example` only if current Coach variables are not already documented
- Modify: `docs/DEPLOYMENT.md` only where versioned-goal backfill behavior needs documenting
- Test: existing OpenAPI tests plus a new lightweight favicon assertion in `apps/web/src/app-shell.test.ts` if no equivalent test exists

**Interfaces:**
- Documents all new routes/types and ships final static asset.

- [ ] **Step 1: Add RED OpenAPI assertions**

Assert the document includes:

```ts
expect(doc.paths['/api/v1/profile/goals']).toBeDefined();
expect(doc.paths['/api/v1/profile/goals/history']).toBeDefined();
expect(doc.paths['/api/v1/coach/daily-summary']).toBeDefined();
expect(doc.components.schemas.ProfileGoalRevision).toBeDefined();
expect(doc.components.schemas.HealthProfile.properties.dailyCarbsGoalGrams).toBeDefined();
```

- [ ] **Step 2: Add favicon asset and HTML link**

Create `apps/web/public/favicon.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#187A55"/>
  <path d="M19 16h15c9 0 16 7 16 16s-7 16-16 16H19V16Zm10 9v14h5c4 0 7-3 7-7s-3-7-7-7h-5Z" fill="#fff"/>
  <path d="M34 42l6 6" stroke="#fff" stroke-width="5" stroke-linecap="round"/>
  <path d="M8 33h9l3-7 5 14 4-8h7" fill="none" stroke="#DDF3E8" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

Add to `<head>` in `apps/web/index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

- [ ] **Step 3: Update OpenAPI to 0.5.0**

Document:
- macro goal fields,
- goal revision metadata,
- `GET/PATCH /profile/goals`,
- `/profile/goals/history`,
- date-correct Today/Progress goal fields,
- `/coach/daily-summary` response.

Do not add new auth scopes.

- [ ] **Step 4: Verify deployment docs and updater behavior**

Confirm `update.sh` order is exactly:

```text
git pull
pnpm install
prisma:generate
build
backup
service stop
prisma:push
goals:backfill
service restart
health check
```

Document that the first deployment creates one `migration` revision effective `1970-01-01`; subsequent deploys are idempotent.

- [ ] **Step 5: Run full verification**

```bash
bash -n update.sh
pnpm test
pnpm typecheck
pnpm build
pnpm smoke:runtime
pnpm smoke:native
docker build -t qnd-health-ci .
```

Expected: all commands exit 0.

- [ ] **Step 6: Fresh code review against the spec**

Review the full diff from the pre-plan checkpoint to current HEAD with focus on:
- no current-profile goal leakage into historical dates,
- no duplicate same-request revisions,
- no Body Battery in daily Coach summary,
- Coach partial-success refresh,
- idempotent backfill.

Fix any findings with RED→GREEN before claiming completion.

- [ ] **Step 7: Commit final docs/assets**

```bash
git add apps/api/src/openapi.ts apps/web/public/favicon.svg apps/web/index.html .env.example docs/DEPLOYMENT.md update.sh
git commit -m "docs: finalize versioned goals deployment contract"
```
