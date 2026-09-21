# Versioned Goals & Coach Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make profile goals historically versioned by effective date, expose carbs/fat/fiber targets, give Coach authoritative demographic/goal context and date-aware mutation tools, refresh the UI after Coach changes, add a cached daily Coach review, and ship a branded favicon without changing the existing single-user deployment model.

**Architecture:** Add a dedicated `ProfileGoalRevision` snapshot stream and one resolver service used by Profile, Today, History, Progress and Coach. Keep `HealthProfile` for demographic data and deprecated compatibility values, while all date-sensitive reads resolve through the new service. The frontend continues using the existing API client, but Settings and Coach refresh paths become revision-aware; daily Coach review is a separate read-only cached flow over deterministic stats plus DeepSeek text.

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

1. **Future-dated goal revisions** — a revision effective tomorrow must not affect Today, History, Progress or Coach context until tomorrow; covered in Tasks 1, 3 and 4.
2. **Two revisions on the same day** — latest `createdAt`, then `id`, must win deterministically; covered in Task 1.
3. **Partial goal patches containing `null`** — nullable macro goals must clear only the supplied field while copying all other active values; covered in Tasks 1 and 3.
4. **Coach mutation succeeds but DeepSeek final response fails** — the persisted goal revision remains, UI refresh runs from `completedActions`, and no rollback occurs; covered in Tasks 5 and 6.
5. **Daily summary provider unavailable** — Today still renders deterministic stats and a local fallback review without Body Battery; covered in Task 7.

---

### Task 1: Versioned Goal Domain and Resolver

**Files:**
- Create: `apps/api/src/profile/goal-repository.ts`
- Create: `apps/api/src/profile/goals.ts`
- Create: `apps/api/test/profile-goals.test.ts`
- Modify: `database/prisma/schema.prisma`
- Modify: `apps/api/src/persistence/prisma-repositories.ts`

**Interfaces:**
- Produces `ProfileGoalValues`, `ProfileGoalRevisionRecord`, `ProfileGoalRevisionRepository`, `ResolvedProfileGoals`, `ProfileGoalService.resolve(date)`, `ProfileGoalService.createRevision(patch, metadata)`, `ProfileGoalService.listRevisions()`.
- Consumes existing `HealthProfileRepository` only as fallback when no revision exists.

- [ ] **Step 1: Write the failing resolver tests with complete in-memory fixtures**

Create `apps/api/test/profile-goals.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ProfileGoalService } from '../src/profile/goals.js';
import type { ProfileGoalRevisionRecord, ProfileGoalRevisionRepository, ProfileGoalValues } from '../src/profile/goal-repository.js';
import type { HealthProfileRepository } from '../src/profile/repository.js';

const base: ProfileGoalValues = {
  activityFactor: 1.2,
  defaultStepsGoal: 7500,
  dailyCaloriesGoalKcal: 1600,
  dailyProteinGoalGrams: 180,
  dailyCarbsGoalGrams: null,
  dailyFatGoalGrams: null,
  dailyFiberGoalGrams: null,
};

function revision(id: string, effectiveFrom: string, createdAt: string, values: ProfileGoalValues): ProfileGoalRevisionRecord {
  return { id, effectiveFrom, createdAt, source: 'manual', sourceRef: null, reason: null, ...values };
}

function memoryGoalRepo(initial: ProfileGoalRevisionRecord[]): ProfileGoalRevisionRepository {
  const rows = [...initial];
  return {
    async findActiveOn(date) {
      return rows
        .filter(row => row.effectiveFrom <= date)
        .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0] ?? null;
    },
    async list() {
      return [...rows].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    },
    async count() { return rows.length; },
    async create(input) {
      const row = { ...input, id: `r-${rows.length + 1}`, createdAt: `2026-09-21T2${rows.length}:00:00.000Z` };
      rows.push(row);
      return row;
    },
  };
}

function fallbackProfileRepo(values: ProfileGoalValues): HealthProfileRepository {
  return {
    async get() {
      return {
        id: 'default', dateOfBirth: null, sexForBmr: null, heightCm: null,
        activityFactor: values.activityFactor,
        defaultStepsGoal: values.defaultStepsGoal,
        dailyCaloriesGoalKcal: values.dailyCaloriesGoalKcal,
        dailyProteinGoalGrams: values.dailyProteinGoalGrams,
      };
    },
    async upsert() { throw new Error('not used'); },
  };
}

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

- [ ] **Step 2: Run the focused test and verify RED**

```bash
pnpm --filter @qnd-health/api test -- profile-goals.test.ts
```

Expected: FAIL because `goal-repository.ts` and `goals.ts` do not exist.

- [ ] **Step 3: Add the Prisma model and repository interfaces**

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

Create `apps/api/src/profile/goals.ts` with these exact public methods:

```ts
export interface ResolvedProfileGoals extends ProfileGoalValues {
  revisionId: string | null;
  effectiveFrom: string | null;
  source: GoalRevisionSource | 'fallback';
}

export class ProfileGoalService {
  constructor(
    private readonly revisions: ProfileGoalRevisionRepository,
    private readonly profile: HealthProfileRepository,
  ) {}

  async resolve(date: string): Promise<ResolvedProfileGoals> {
    const revision = await this.revisions.findActiveOn(date);
    if (revision) return { ...revision, revisionId: revision.id };
    const profile = await this.profile.get();
    return {
      revisionId: null,
      effectiveFrom: null,
      source: 'fallback',
      activityFactor: profile?.activityFactor ?? 1.2,
      defaultStepsGoal: profile?.defaultStepsGoal ?? 7500,
      dailyCaloriesGoalKcal: profile?.dailyCaloriesGoalKcal ?? null,
      dailyProteinGoalGrams: profile?.dailyProteinGoalGrams ?? null,
      dailyCarbsGoalGrams: null,
      dailyFatGoalGrams: null,
      dailyFiberGoalGrams: null,
    };
  }

  async createRevision(
    patch: Partial<ProfileGoalValues>,
    meta: { effectiveFrom: string; source: GoalRevisionSource; sourceRef: string | null; reason: string | null },
  ): Promise<ProfileGoalRevisionRecord> {
    const active = await this.resolve(meta.effectiveFrom);
    const values: ProfileGoalValues = { ...active, ...patch };
    validateProfileGoalValues(values);
    return this.revisions.create({ ...values, ...meta });
  }

  async listRevisions() { return this.revisions.list(); }
}
```

`validateProfileGoalValues()` enforces: `activityFactor > 0`, integer `defaultStepsGoal > 0`, and every nutrition goal is integer `> 0` or `null`.

- [ ] **Step 5: Implement the Prisma adapter**

Extend `PrismaClientPort` and `createPrismaRepositories()` in `apps/api/src/persistence/prisma-repositories.ts` with `profileGoalRevisionRepository`. `findActiveOn(date)` uses:

```ts
where: { effectiveFrom: { lte: new Date(`${date}T00:00:00.000Z`) } },
orderBy: [
  { effectiveFrom: 'desc' },
  { createdAt: 'desc' },
  { id: 'desc' },
],
take: 1,
```

Convert `effectiveFrom` back to `YYYY-MM-DD` and `createdAt` to ISO strings.

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

- [ ] **Step 1: Write the failing idempotency test**

Use the same explicit `memoryGoalRepo()` fixture pattern from Task 1. The test body is:

```ts
const values = {
  activityFactor: 1.2,
  defaultStepsGoal: 7500,
  dailyCaloriesGoalKcal: 1600,
  dailyProteinGoalGrams: 180,
  dailyCarbsGoalGrams: null,
  dailyFatGoalGrams: null,
  dailyFiberGoalGrams: null,
};
const revisions = memoryGoalRepo([]);
const profiles = fallbackProfileRepo(values);
expect(await backfillProfileGoals(revisions, profiles)).toBe('created');
expect(await backfillProfileGoals(revisions, profiles)).toBe('skipped');
expect(await revisions.count()).toBe(1);
expect((await revisions.list())[0]).toMatchObject({ effectiveFrom: '1970-01-01', source: 'migration' });
```

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- profile-goals-backfill.test.ts
```

Expected: FAIL because backfill module does not exist.

- [ ] **Step 3: Implement backfill function and CLI**

`backfillProfileGoals()`:

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

`apps/api/src/scripts/backfill-profile-goals.ts` opens the same Prisma client used by the runtime, creates repositories with `createPrismaRepositories`, calls the function, prints `created`/`skipped`, and disconnects in `finally`.

- [ ] **Step 4: Add package script**

In `apps/api/package.json`:

```json
"goals:backfill": "pnpm prisma:generate && tsx src/scripts/backfill-profile-goals.ts"
```

- [ ] **Step 5: Wire `update.sh` after `prisma:push` and before restart**

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
- Produces `GET /api/v1/profile/goals?date=YYYY-MM-DD`, `GET /api/v1/profile/goals/history`, `PATCH /api/v1/profile/goals`, and backward-compatible `GET/PATCH /api/v1/profile`.

- [ ] **Step 1: Add RED API tests**

In `profile-goals-api.test.ts`, assert:

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

Extend `profile-api.test.ts`: one PATCH containing `heightCm` plus `dailyCaloriesGoalKcal` updates the demographic row and creates exactly one goal revision effective today.

- [ ] **Step 2: Verify RED**

```bash
pnpm --filter @qnd-health/api test -- profile-goals-api.test.ts profile-api.test.ts
```

Expected: FAIL on missing routes/service wiring and new macro fields.

- [ ] **Step 3: Split profile validation into demographic and goal schemas**

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

`PATCH /profile` splits the body: demographic keys go to `HealthProfileRepository.upsert`; any versioned keys create exactly one revision with `effectiveFrom=localToday`, `source='manual'`.

- [ ] **Step 4: Implement goal routes and compatibility response**

Resolved goal responses include:

```ts
{
  revisionId,
  effectiveFrom,
  source,
  activityFactor,
  defaultStepsGoal,
  dailyCaloriesGoalKcal,
  dailyProteinGoalGrams,
  dailyCarbsGoalGrams,
  dailyFatGoalGrams,
  dailyFiberGoalGrams,
}
```

`GET /profile` returns demographic fields plus today's resolved goal values as flat compatibility fields and current revision metadata.

- [ ] **Step 5: Wire one goal service through `app.ts` and `runtime.ts`**

`buildApp()` receives `profileGoalRevisionRepository`, creates one `ProfileGoalService`, and passes it into Profile, Today, Insights and Coach route registrations. No route creates its own resolver.

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
- Produces date-correct goal fields in Today, History and Progress.

- [ ] **Step 1: Add RED tests for historical resolution**

Today:

```ts
expect((await getToday('2026-09-21')).nutrition.goals.caloriesKcal).toBe(1600);
expect((await getToday('2026-09-22')).nutrition.goals.caloriesKcal).toBe(1900);
expect((await getToday('2026-09-21')).energy.activityFactor).toBe(1.2);
expect((await getToday('2026-09-22')).energy.activityFactor).toBe(1.3);
```

Garmin precedence:

```ts
expect(today.activity.steps.target).toBe(9000);
expect(today.activity.steps.goalSource).toBe('garmin');
```

History:

```ts
expect(history.days.find(day => day.date === '2026-09-21')?.goals.dailyCaloriesGoalKcal).toBe(1600);
expect(history.days.find(day => day.date === '2026-09-22')?.goals.dailyCaloriesGoalKcal).toBe(1900);
```

Progress:

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

Expected: FAIL because current routes use current-profile values.

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
  ...existingNutrition,
}
```

Update `resolveStepGoal()` to take `goals.defaultStepsGoal` as the profile target. Historical energy calculation uses `goals.activityFactor`.

- [ ] **Step 4: Resolve History/Progress goals for every calendar date**

In `insights/routes.ts`:

```ts
const dates = calendarDays(from, to);
const resolvedGoals = await Promise.all(dates.map(async date => [date, await deps.profileGoalService.resolve(date)] as const));
const goalsByDate = new Map(resolvedGoals);
```

Add `goals` to each History day and use the date's values for every Progress goal series field. Remove use of `data.profile` for step/calorie/protein targets.

- [ ] **Step 5: Update web response types**

In `apps/web/src/types.ts`, Today nutrition includes:

```ts
goals: {
  caloriesKcal: number | null;
  proteinGrams: number | null;
  carbsGrams: number | null;
  fatGrams: number | null;
  fiberGrams: number | null;
};
```

History day gets a `goals` snapshot; Progress series gets all five nutrition goals plus `stepsGoal`.

- [ ] **Step 6: Verify**

```bash
pnpm --filter @qnd-health/api test -- today-api.test.ts history-progress-api.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/today apps/api/src/insights apps/api/test/today-api.test.ts apps/api/test/history-progress-api.test.ts apps/web/src/types.ts
git commit -m "feat: resolve historical goals in today and insights"
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
- Produces explicit `update_goals` and demographic-only `update_profile`.

- [ ] **Step 1: Add RED context test for saved DOB and age**

For context date `2026-09-21` and DOB `1987-12-12`:

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

- [ ] **Step 2: Add RED tool schema/execution tests**

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

Execution assertion:

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

- [ ] **Step 4: Update context builder with a correct age calculation**

```ts
function ageOn(dateOfBirth: string, date: string): number {
  const birth = new Date(`${dateOfBirth}T12:00:00.000Z`);
  const on = new Date(`${date}T12:00:00.000Z`);
  let age = on.getUTCFullYear() - birth.getUTCFullYear();
  const beforeBirthday = on.getUTCMonth() < birth.getUTCMonth()
    || (on.getUTCMonth() === birth.getUTCMonth() && on.getUTCDate() < birth.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}
```

Expose `dateOfBirth`, `ageYears`, `sexForBmr`, `heightCm` and all resolved goals as authoritative context values.

- [ ] **Step 5: Split Coach tools**

`update_profile` exposes only:

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

Keep `set_default_step_goal` as a compatibility alias that creates a revision effective today.

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
- Modify: `apps/web/src/profile-settings.test.ts`
- Modify: `apps/web/src/ProfileSettings.tsx`
- Modify: `apps/web/src/CoachView.tsx`
- Modify: `apps/web/src/CoachView.test.tsx`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/SettingsView.tsx`
- Modify: `apps/web/src/features.css`

**Interfaces:**
- Consumes new Profile/Goals API and Today goal fields.
- Produces visible macro targets, effective-date copy and `onDataMutated()` refresh flow.

- [ ] **Step 1: Add RED form serialization tests**

Extend `ProfileFormState` with:

```ts
dailyCarbsGoalGrams: string;
dailyFatGoalGrams: string;
dailyFiberGoalGrams: string;
```

In `profile-settings.test.ts`:

```ts
expect(buildGoalPatch({
  ...profileFormDefaults(null),
  dailyCarbsGoalGrams: '150',
  dailyFatGoalGrams: '60',
  dailyFiberGoalGrams: '30',
})).toMatchObject({
  dailyCarbsGoalGrams: 150,
  dailyFatGoalGrams: 60,
  dailyFiberGoalGrams: 30,
});
```

- [ ] **Step 2: Add RED Coach refresh tests**

In `CoachView.test.tsx`, render with `onDataMutated={spy}`. For a successful response containing:

```ts
{ actions: [{ name: 'update_goals', status: 'completed', result: {} }] }
```

assert `spy` is called once. Repeat with a simulated `502` body containing `completedActions: [{ name: 'update_goals', status: 'completed', result: {} }]`; assert it is still called once because the mutation already succeeded.

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

Extend `HealthProfile` with resolved macro fields and revision metadata.

- [ ] **Step 5: Split ProfileSettings UI into profile data and current goals**

Render two visual groups:

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
- "Obowiązuje od DD.MM.YYYY"
```

Saving demographics uses `updateProfile`; saving goal values uses one `updateGoals({ effectiveFrom: today, ... })` request. A single user click may call both endpoints, but must create at most one goal revision.

- [ ] **Step 6: Update Today macro cards**

Use one compact renderer for Protein/Carbs/Fat/Fiber:

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

Pass it to `CoachView`. Pass `profileVersion` to `SettingsView/ProfileSettings` and include it in profile-loading effect dependencies. Do not infer values from model text.

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
- Uses existing `CoachReview` as cache storage keyed by input hash inside `inputJson`.
- No Coach tools are exposed to DeepSeek in this flow.

- [ ] **Step 1: Write RED backend tests**

Deterministic stats and Body Battery exclusion:

```ts
const summary = await service.getDailySummary('2026-09-21');
expect(summary.stats.activity.stepsPercent).toBe(100);
expect(summary.stats.calories.percent).toBe(103);
expect(JSON.stringify(provider.lastInput)).not.toContain('bodyBattery');
```

Provider failure fallback:

```ts
provider.failNext();
const summary = await service.getDailySummary('2026-09-21');
expect(summary.source).toBe('fallback');
expect(summary.verdict).toMatch(/kroki|kalorie|plan/i);
```

Cache: call twice with unchanged normalized input and assert provider call count is `1`.

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
  saveDailySummary(input: { date: string; inputHash: string; normalizedInput: unknown; output: DailyCoachSummaryResponse }): Promise<void>;
}
```

Prisma adapter uses `CoachReview` rows with `reviewType='daily_summary'`, `periodStart=periodEnd=<date>`, `inputJson={ inputHash, normalizedInput }`, `outputJson=<response>`, `status='complete'`.

- [ ] **Step 4: Implement deterministic summary input**

`daily-summary.ts` computes:

```ts
activity: { stepsCurrent, stepsTarget, stepsPercent, plannedCount, completedCount },
calories: { consumedKcal, targetKcal, percent, deltaKcal },
progress7: { planCompletionPercent, averageSteps, weightDeltaKg },
```

Do not copy `bodyBattery` into normalized input. Hash exactly:

```ts
createHash('sha256').update(JSON.stringify(normalizedInput)).digest('hex')
```

- [ ] **Step 5: Ask DeepSeek for verdict without tools**

Call:

```ts
deepseekClient.completeTurn({
  tools: [],
  messages: [
    { role: 'system', content: 'Napisz po polsku bardzo krótką, surową ale sprawiedliwą ocenę dnia na podstawie statystyk. Zwróć 1-2 zdania werdyktu i jedną konkretną sugestię. Nie diagnozuj i nie wspominaj Body Battery.' },
    { role: 'user', content: JSON.stringify(normalizedInput) },
  ],
});
```

If provider throws, generate a deterministic Polish fallback from steps/calorie/plan percentages.

- [ ] **Step 6: Add route**

`GET /api/v1/coach/daily-summary?date=YYYY-MM-DD` requires `coach:read`, validates date and returns:

```ts
{ date, stats, verdict, suggestion, source: 'deepseek' | 'cache' | 'fallback' }
```

- [ ] **Step 7: Add RED frontend test and component**

`DailyCoachSummary.test.tsx` asserts labels `Aktywność`, `Kalorie`, `Postęp 7 dni` and absence of `Body Battery`.

Component shows three compact evaluation stat cards, one verdict, one action suggestion and a link/button to full Coach view.

- [ ] **Step 8: Replace the homepage placeholder**

In `App.tsx`, fetch daily summary when selected date changes, Today refreshes after a mutation, or the Coach widget becomes visible. If summary API fails completely, render a local deterministic stat fallback rather than hiding the widget.

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
- Create: `apps/web/src/app-shell.test.ts`
- Modify: `apps/web/index.html`
- Modify: `apps/api/src/openapi.ts`
- Modify: `apps/api/test/openapi.test.ts`
- Modify: `docs/DEPLOYMENT.md`
- Modify: `update.sh`

**Interfaces:**
- Documents all new routes/types and ships the final static asset.

- [ ] **Step 1: Add RED OpenAPI assertions**

In `apps/api/test/openapi.test.ts`:

```ts
expect(doc.paths['/api/v1/profile/goals']).toBeDefined();
expect(doc.paths['/api/v1/profile/goals/history']).toBeDefined();
expect(doc.paths['/api/v1/coach/daily-summary']).toBeDefined();
expect(doc.components.schemas.ProfileGoalRevision).toBeDefined();
expect(doc.components.schemas.HealthProfile.properties.dailyCarbsGoalGrams).toBeDefined();
```

- [ ] **Step 2: Generate favicon visual reference, then implement a simplified SVG asset**

Because this is a user-requested image/brand asset, use the image-generation tool first to create the visual reference: square app icon, QND green, rounded health mark, stylized `Q`, short pulse line, no gradients/fine text. Use that reference to implement a favicon that remains legible at 16×16 and 32×32.

The committed asset is `apps/web/public/favicon.svg`. Add to `<head>` in `apps/web/index.html`:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

Create `apps/web/src/app-shell.test.ts` that reads `apps/web/index.html` and asserts it contains `href="/favicon.svg"`.

- [ ] **Step 3: Update OpenAPI to 0.5.0**

Document macro goal fields, revision metadata, `GET/PATCH /profile/goals`, `/profile/goals/history`, date-correct Today/History/Progress goal fields, and `/coach/daily-summary`. Do not add auth scopes.

- [ ] **Step 4: Document updater/backfill behavior**

`docs/DEPLOYMENT.md` states the canonical order:

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

and that first deploy creates one `migration` revision effective `1970-01-01`; later deploys skip backfill.

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

Expected: every command exits `0`.

- [ ] **Step 6: Fresh code review against the spec**

Review the full diff from the pre-plan checkpoint to current HEAD, explicitly checking:

```text
historical dates never read current-profile goals
one profile save creates at most one goal revision
Body Battery is absent from daily-summary input/output
Coach partial-success refreshes authoritative API data
backfill is idempotent
future-dated goals do not leak into Today
```

Any finding gets a new failing test before its fix.

- [ ] **Step 7: Commit final docs/assets**

```bash
git add apps/api/src/openapi.ts apps/api/test/openapi.test.ts apps/web/public/favicon.svg apps/web/index.html apps/web/src/app-shell.test.ts docs/DEPLOYMENT.md update.sh
git commit -m "docs: finalize versioned goals deployment contract"
```
