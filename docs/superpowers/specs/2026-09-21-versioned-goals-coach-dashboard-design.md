# QND Health — Versioned Goals, Coach Context and Daily Coach Dashboard

Date: 2026-09-21
Status: Design approved in conversation; written spec pending final user review

## 1. Purpose

QND Health currently stores nutrition and activity targets directly on the single `HealthProfile`. This makes a changed target retroactively appear as if it had always been in force. It also makes Coach actions hard to reason about historically: if Coach changes 1600 kcal to 1900 kcal, old days can be evaluated against 1900 even though that target did not exist then.

This change makes user targets versioned over time, fixes Coach context and post-action refresh, adds the missing macro targets, improves the Today Coach widget, and adds a branded favicon.

The result must preserve the existing single-user architecture and SQLite deployment model.

## 2. User-facing behavior

### 2.1 Historical goal semantics

Goals are daily settings with a local effective date in `Europe/Warsaw`.

Example:

- through 2026-09-21: 1600 kcal
- from 2026-09-22: 1900 kcal

Changing a goal never rewrites the target shown for earlier dates.

A change whose effective date is today applies to the whole selected calendar day. We intentionally do not split a daily target within one day by hour.

Coach must respect natural-language timing:

- “ustaw 1900 kcal” -> effective from today,
- “od jutra 1900 kcal” -> effective from tomorrow,
- “od poniedziałku” -> effective from that local calendar date.

### 2.2 Versioned settings

The following values are versioned together:

- `activityFactor`
- `defaultStepsGoal`
- `dailyCaloriesGoalKcal`
- `dailyProteinGoalGrams`
- `dailyCarbsGoalGrams`
- `dailyFatGoalGrams`
- `dailyFiberGoalGrams`

Demographic/profile fields remain ordinary profile data:

- `dateOfBirth`
- `sexForBmr`
- `heightCm`

This separation is deliberate: a historical nutrition target must remain stable, while correcting a typo in date of birth should not require creating a new nutrition-goal revision.

### 2.3 Garmin step target precedence

For a selected day, step target resolution is:

1. Garmin `DailyHealth.stepsGoal`, if present for that day,
2. the active goal revision's `defaultStepsGoal`,
3. fallback 7500.

A Garmin daily goal does not modify or create a profile goal revision.

## 3. Data model

Add a new Prisma model `ProfileGoalRevision`.

Proposed fields:

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

`effectiveFrom` is stored as the canonical midnight representation of the local effective date, using the same date normalization conventions as existing day-based records.

### 3.1 Snapshot revisions, not per-field events

Each revision is a complete snapshot of all versioned goal fields.

When one field changes, the service:

1. resolves the currently active revision,
2. copies its full values,
3. applies the requested patch,
4. creates one new revision.

This avoids reconstructing state from multiple independent event streams and makes date resolution deterministic.

Multiple revisions may have the same `effectiveFrom`. When that happens, the latest `createdAt` wins. This allows a user or Coach to correct today's targets more than once without destructive updates.

### 3.2 Sources

`source` uses these values initially:

- `manual`
- `coach`
- `migration`

`sourceRef` may contain a Coach conversation ID for Coach-created revisions. `reason` may contain a short human-readable reason supplied by Coach or the UI.

## 4. Migration and backward compatibility

Existing `HealthProfile` goal columns must not be dropped in this slice. They become deprecated compatibility fields and are no longer authoritative after backfill.

The update process adds an idempotent backfill step after `prisma:push`:

- if at least one `ProfileGoalRevision` exists, do nothing;
- otherwise, read the existing `HealthProfile` values;
- create one `migration` revision carrying the current values.

The initial revision may use a baseline effective date early enough to preserve the current historical appearance of existing data. Because QND Health cannot reconstruct previous target changes that were never stored, the current values become the baseline for all pre-versioning dates. All changes after this migration are historically exact.

`update.sh` remains the single deployment command and runs the backfill automatically.

## 5. Goal resolution service

Introduce one backend unit responsible for resolving goals by date, for example `profile/goals.ts`.

Core operations:

```ts
resolveGoals(date: string): Promise<ResolvedGoals>
createGoalRevision(patch, { effectiveFrom, source, sourceRef, reason }): Promise<ProfileGoalRevision>
listGoalRevisions(): Promise<ProfileGoalRevision[]>
```

No Today, Progress, Coach or Profile route should implement its own revision-selection logic.

`ResolvedGoals` contains the seven versioned values plus revision metadata (`revisionId`, `effectiveFrom`, `source`).

## 6. API contract

### 6.1 Existing profile endpoint

`GET /api/v1/profile` remains backward compatible for the web app and Hermes.

It returns demographic profile fields plus the goals active today as flat compatibility fields:

- `activityFactor`
- `defaultStepsGoal`
- `dailyCaloriesGoalKcal`
- `dailyProteinGoalGrams`
- `dailyCarbsGoalGrams`
- `dailyFatGoalGrams`
- `dailyFiberGoalGrams`

It should also return current revision metadata so the UI can state when targets became active.

### 6.2 Profile mutation

`PATCH /api/v1/profile` remains supported.

- demographic fields update `HealthProfile` directly;
- any versioned goal fields in the same request create one goal revision effective today;
- one request must create at most one revision.

This preserves existing clients while changing the semantics safely.

### 6.3 First-class goal API

Add:

```http
GET /api/v1/profile/goals?date=YYYY-MM-DD
GET /api/v1/profile/goals/history
PATCH /api/v1/profile/goals
```

`PATCH /profile/goals` accepts:

```json
{
  "effectiveFrom": "2026-09-22",
  "activityFactor": 1.3,
  "dailyCaloriesGoalKcal": 1900,
  "dailyProteinGoalGrams": 180,
  "dailyCarbsGoalGrams": 160,
  "dailyFatGoalGrams": 65,
  "dailyFiberGoalGrams": 30,
  "reason": "Nowy plan od Coacha"
}
```

Only supplied values are changed; the revision snapshot copies the rest from the previous active state.

Authorization follows the existing profile scopes (`measurements:read` / `measurements:write`) for compatibility in this single-user MVP.

## 7. Today, History and Progress

### 7.1 Today

`GET /today?date=...` resolves targets for the selected date, not the current profile values.

Nutrition response gains date-correct goals for:

- kcal
- protein
- carbs
- fat
- fiber

The four macro cards use the same compact pattern:

`consumed / target`, progress bar, percentage.

No target means the card keeps showing only the consumed amount.

### 7.2 Historical days

History must never use today's targets to render an old day. For each calendar day it resolves that day's active revision.

### 7.3 Progress series

Progress series must resolve targets per point/date. At minimum it carries:

- `stepsGoal`
- `caloriesGoalKcal`
- `proteinGoalGrams`
- `carbsGoalGrams`
- `fatGoalGrams`
- `fiberGoalGrams`

Existing charts therefore retain the goal that was active on that date. New macro targets are available for later visualization without changing historical semantics again.

BMR/TDEE calculations for a selected historical day use that day's `activityFactor` revision.

## 8. Coach context fixes

### 8.1 Demographic context

The normalized Coach context must include:

- `dateOfBirth`
- `ageYears`, calculated for the context date
- `sexForBmr`
- `heightCm`
- resolved `activityFactor`

Coach must no longer infer or assume age when a saved date of birth exists.

### 8.2 Goals

Coach context includes all resolved goals for the context date:

- steps
- kcal
- protein
- carbs
- fat
- fiber
- activity factor
- revision effective date

The system prompt should state that these are authoritative QND Health profile values and must be used instead of guesses.

Body Battery must not be used as a primary coaching metric. The daily homepage review must not use it at all. In chat it should only be mentioned if the user explicitly asks about it.

## 9. Coach tools

### 9.1 Explicit schemas

The current generic `update_profile` tool schema is too vague. Replace the goal-changing part with a first-class tool:

```text
update_goals
```

Its JSON schema explicitly exposes:

- `effectiveFrom`
- `activityFactor`
- `defaultStepsGoal`
- `dailyCaloriesGoalKcal`
- `dailyProteinGoalGrams`
- `dailyCarbsGoalGrams`
- `dailyFatGoalGrams`
- `dailyFiberGoalGrams`
- `reason`

`update_profile` remains for demographic fields (`dateOfBirth`, `sexForBmr`, `heightCm`).

The older `set_default_step_goal` tool may remain temporarily as a compatibility alias, but internally it must create a goal revision rather than mutate `HealthProfile`.

### 9.2 Coach source metadata

Coach-created revisions use:

- `source = coach`
- `sourceRef = conversationId`

Every Coach mutation remains audited using the existing audit repository.

## 10. Immediate UI refresh after Coach actions

A successful Coach action must become visible without a manual browser reload.

`CoachView` receives an `onDataMutated` callback from `App`.

If a completed action is a mutation, App refreshes the currently selected Today data and increments a small profile/settings data version. Components that depend on profile data re-fetch when that version changes.

The UI must not optimistically invent the new values from model text. It re-reads the authoritative API after the tool call succeeds.

Example:

1. Coach executes `update_goals` from 1600 to 1900 kcal effective today.
2. Tool succeeds and is persisted/audited.
3. web app refreshes Today/profile.
4. Nutrition displays `... / 1900 kcal` immediately.
5. a previous day still resolves to 1600 kcal.

## 11. Settings UI

The profile settings remain one card but visually separate:

### Profile data

- date of birth
- BMR sex
- height

### Current goals

- activity factor
- default steps
- kcal
- protein
- carbs
- fat
- fiber

The goal section states the active date, for example:

`Obowiązuje od 22.09.2026`

Saving goal fields creates a revision effective today by default.

A small optional “Historia celów” affordance may show existing revisions, but a full history editor is out of scope for this slice. Historical revisions are append-only through normal UI/Coach flows; correction is represented by a newer revision for the same effective date.

## 12. Daily AI Coach widget on Today

The existing static placeholder-style widget is replaced by a real read-only daily review.

It shows three compact evaluation stats:

1. **Aktywność** — steps vs target plus plan/activity completion.
2. **Kalorie** — consumed vs the date-correct kcal target.
3. **Postęp 7 dni** — recent adherence/trend using available progress data.

Below them, DeepSeek provides a short Polish verdict and one actionable suggestion. Tone follows the existing Coach system prompt: demanding, specific, fair, no motivational filler.

### 12.1 No Body Battery

The daily review input and rendered stats do not contain Body Battery.

### 12.2 Read-only summary path

Add a read-only endpoint such as:

```http
GET /api/v1/coach/daily-summary?date=YYYY-MM-DD
```

It requires `coach:read` only and does not expose tools to the model.

The backend first computes deterministic metrics (steps %, kcal %, plan completion/trend), then asks DeepSeek only for the concise verdict text/labels. If the provider fails, the endpoint returns the deterministic stats with a local fallback summary rather than breaking Today.

### 12.3 Caching

Avoid a paid model call on every page render.

Use the existing `CoachReview` persistence as the cache foundation for `reviewType = daily_summary`. The cached summary is reusable while its normalized input hash is unchanged. Any relevant Today/progress/goal change produces a different input hash and allows regeneration.

This keeps refreshes cheap while ensuring Coach changes are reflected.

## 13. Favicon

Add a lightweight SVG favicon in `apps/web/public/favicon.svg` and reference it from `index.html`.

Visual direction:

- QND green (`#187A55` / current primary green),
- simple rounded health mark,
- stylized `Q` integrated with a short pulse line,
- legible at 16x16 and 32x32,
- no text beyond the single `Q`, no gradients or fine detail.

The favicon is an application asset, not a new branding system.

## 14. Error handling

- Goal revision creation validates all supplied numeric values using the same limits as current profile validation.
- `effectiveFrom` must be a valid local ISO date.
- If no revision exists after migration, resolver still falls back safely to current profile/default values rather than failing Today.
- If DeepSeek daily summary fails, Today remains usable with deterministic stats and a fallback message.
- Coach tool actions only trigger client refresh after the mutation actually succeeds.
- Missing macro goals remain `null`; QND never invents them.

## 15. OpenAPI and Hermes

OpenAPI must document:

- new macro goal fields,
- goal history and date-resolution endpoints,
- `effectiveFrom`, `source` and revision metadata,
- date-correct goal fields in Today/Progress,
- daily Coach summary endpoint.

Hermes may read and update goals through the API if its token already has the existing profile write scope. No new token scope is required for this slice.

## 16. Testing strategy

Implementation follows RED -> GREEN.

Required automated coverage:

1. goal resolver selects the newest revision active on a given date;
2. later goal changes do not alter earlier dates;
3. same-day correction chooses latest `createdAt`;
4. Garmin step goal overrides profile revision for that day only;
5. profile compatibility endpoint returns today's resolved values;
6. new carbs/fat/fiber goals validate, persist and round-trip;
7. Progress exposes historical goal values per date;
8. historical TDEE uses historical activity factor;
9. Coach context contains saved DOB and calculated age;
10. Coach tool schema explicitly exposes all goal fields and `effectiveFrom`;
11. Coach goal mutation creates a revision with `source=coach` and conversation reference;
12. frontend refresh hook runs after successful mutating Coach actions;
13. old day remains unchanged after a new Coach goal change;
14. Today macro cards show goal progress when configured;
15. daily Coach summary excludes Body Battery;
16. daily Coach summary returns deterministic fallback when DeepSeek fails;
17. summary cache is reused when input hash is unchanged;
18. favicon is linked from `index.html`;
19. backfill is idempotent and preserves current pre-versioning goals.

Full verification remains:

- tests,
- TypeScript typecheck,
- web/API build,
- runtime smoke,
- native SQLite smoke,
- Docker build,
- `update.sh` syntax and one-time backfill path.

## 17. Deployment

No manual migration sequence should be added for the user. `update.sh` remains the canonical deployment path and performs:

1. `git pull`,
2. dependency install,
3. Prisma generate,
4. build,
5. database backup,
6. service stop,
7. `prisma:push`,
8. idempotent goal-revision backfill,
9. service start,
10. health check.

The existing web token and Hermes token remain valid because this design reuses current scopes.

## 18. Out of scope

- intra-day/hourly target revisions,
- deleting historical revisions from the normal UI,
- automatically choosing calorie or macro targets without user/Coach action,
- a full diet prescription engine,
- replacing Garmin's own daily step target,
- a new Coach model/provider,
- redesigning all Progress charts around macros in this slice.

## 19. Success criteria

The change is successful when:

- changing a target today does not change yesterday's displayed target;
- Coach can explicitly change activity factor, steps, kcal, protein, carbs, fat and fiber with a chosen effective date;
- Coach knows the saved date of birth/age instead of guessing;
- Coach mutations appear in the UI immediately after the successful tool call;
- Today evaluates activity, calories and 7-day progress without Body Battery;
- macro cards display configured goals consistently;
- historical charts use historical targets;
- update remains one-command via `bash update.sh`;
- QND Health has a clean branded favicon.
