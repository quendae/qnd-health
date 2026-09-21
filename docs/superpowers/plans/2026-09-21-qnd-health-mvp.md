# QND Health MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a private self-hosted QND Health application with a usable activity planner, completed-activity tracking, Hermes read/write API, progress analytics, DeepSeek coaching, and a Garmin-ready provider boundary.

**Architecture:** Use a TypeScript pnpm monorepo with `apps/web` and `apps/api`, shared domain packages, PostgreSQL through Prisma, and a REST/OpenAPI backend used by both the browser and Hermes. Deterministic analytics remain separate from the DeepSeek adapter. Garmin and FIT import normalize data into the same `CompletedActivity` model.

**Tech Stack:** Node.js 22, TypeScript, pnpm workspaces, Fastify, Zod, Prisma, PostgreSQL 16, React + Vite, Vitest, Testing Library, Playwright, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-21-qnd-health-design.md`

## Global Constraints

- Private single-user deployment; no public registration or multi-tenant feature in MVP.
- PostgreSQL is the source of truth.
- Docker Compose is the default deployment path.
- All third-party secrets and agent tokens stay server-side.
- Hermes API is REST/JSON under `/api/v1` and publishes OpenAPI at `/api/openapi.json`.
- Hermes tokens are bearer tokens stored only as hashes and authorized by explicit scopes.
- AI receives locally calculated metrics; DeepSeek must not perform deterministic application arithmetic.
- FIT/manual use must work before Garmin API access exists.
- Garmin remains behind a provider interface.
- AI recommendations do not bypass local validation rules.

## Review Focus

1. Duplicate Hermes retries with the same `Idempotency-Key` must not create duplicate planned activities.
2. A valid token without `plans:write` must receive 403 on planner mutation while retaining allowed read access.
3. Invalid or revoked bearer tokens must return 401 without leaking token material into logs.
4. A malformed or unsupported FIT file must fail cleanly without leaving a partial completed activity in the database.
5. DeepSeek returning invalid JSON or out-of-policy recommendations must not mutate the plan and must surface a recoverable coach error.

---

### Task 1: Monorepo, database, and API foundation

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `docker-compose.yml`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/routes/health.ts`
- Create: `apps/api/test/health.test.ts`
- Create: `database/prisma/schema.prisma`
- Create: `database/prisma/seed.ts`
- Create: `README.md`

**Interfaces:**
- Produces: `buildApp(): FastifyInstance`
- Produces: `GET /api/v1/health -> { status: "ok" }`
- Produces: Prisma models used by later tasks.

- [ ] **Step 1: Write the failing API health test**

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';

describe('GET /api/v1/health', () => {
  it('returns ok', async () => {
    const app = buildApp();
    const response = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --filter @qnd-health/api test -- health.test.ts`  
Expected: FAIL because `buildApp` and the API package do not exist.

- [ ] **Step 3: Add workspace and API scaffold**

Root `package.json` scripts:

```json
{
  "private": true,
  "packageManager": "pnpm@10.17.1",
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck",
    "build": "pnpm -r build"
  }
}
```

`apps/api/src/app.ts`:

```ts
import Fastify from 'fastify';

export function buildApp() {
  const app = Fastify({ logger: true });
  app.get('/api/v1/health', async () => ({ status: 'ok' as const }));
  return app;
}
```

- [ ] **Step 4: Add initial Prisma schema**

Create enums and models for `PlannedActivity`, `CompletedActivity`, `ActivityMatch`, `DailyHealth`, `CoachReview`, `CoachRecommendation`, `CoachDecision`, `ApiToken`, `AuditEvent`, and `IdempotencyRecord` exactly as required by the design spec. Use UUID primary keys and UTC timestamps.

- [ ] **Step 5: Add PostgreSQL Docker Compose service**

Use PostgreSQL 16 with a named volume and environment defaults matching `.env.example`.

- [ ] **Step 6: Run validation**

Run:

```bash
pnpm install
pnpm --filter @qnd-health/api test
pnpm typecheck
pnpm exec prisma validate --schema database/prisma/schema.prisma
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "feat: scaffold qnd health backend and database"
```

---

### Task 2: Planner domain service and Hermes API authentication

**Files:**
- Create: `packages/activity-model/package.json`
- Create: `packages/activity-model/src/planned-activity.ts`
- Create: `apps/api/src/lib/prisma.ts`
- Create: `apps/api/src/lib/api-error.ts`
- Create: `apps/api/src/auth/token.ts`
- Create: `apps/api/src/auth/scopes.ts`
- Create: `apps/api/src/plugins/request-context.ts`
- Create: `apps/api/src/plugins/hermes-auth.ts`
- Create: `apps/api/src/services/plans.ts`
- Create: `apps/api/src/routes/plans.ts`
- Create: `apps/api/src/routes/tokens.ts`
- Create: `apps/api/src/services/audit.ts`
- Create: `apps/api/src/services/idempotency.ts`
- Create: `apps/api/test/plans.test.ts`
- Create: `apps/api/test/auth.test.ts`
- Create: `apps/api/test/idempotency.test.ts`

**Interfaces:**
- Produces: `createApiToken(name, scopes): Promise<{ token: string; id: string }>`
- Produces: `requireScopes(...scopes)` Fastify pre-handler.
- Produces: `PlansService.create(input, actor)` / `list(range)` / `get(id)` / `patch(id, input, actor)` / `remove(id, actor)`.
- Produces REST endpoints under `/api/v1/plans`.

- [ ] **Step 1: Write failing scope tests**

Test three cases:

```ts
it('rejects a missing bearer token with 401');
it('allows plans:read token to list plans');
it('rejects mutation for plans:read token with 403');
```

- [ ] **Step 2: Write failing idempotency test**

Send two identical `POST /api/v1/plans` requests with the same `Idempotency-Key` and assert both responses reference the same `id` and only one database row exists.

- [ ] **Step 3: Run tests and verify failures**

Run: `pnpm --filter @qnd-health/api test -- auth.test.ts plans.test.ts idempotency.test.ts`  
Expected: FAIL because auth and planner routes do not exist.

- [ ] **Step 4: Implement token hashing and verification**

Generate token bytes with Node `crypto.randomBytes(32)`, present them as `qndh_<base64url>`, store only a SHA-256 digest, and compare hashes using `timingSafeEqual`.

Never write plaintext token values to application logs.

- [ ] **Step 5: Implement explicit scopes**

Define:

```ts
export const apiScopes = [
  'activities:read', 'activities:write',
  'plans:read', 'plans:write',
  'progress:read',
  'coach:read', 'coach:write',
  'health:read'
] as const;
```

A request with no valid token returns 401. A valid token missing a required scope returns 403.

- [ ] **Step 6: Implement planner validation and CRUD**

Use Zod schemas. Require ISO date, supported `activityType`, non-empty `title`, non-negative optional duration/distance, and sensible HR range (`targetHrMin <= targetHrMax`).

- [ ] **Step 7: Implement audit writes**

Each Hermes mutation creates an `AuditEvent` with token id, request id, action, entity type/id, and a minimal field-diff summary.

- [ ] **Step 8: Implement idempotency**

For POST/command mutations with an `Idempotency-Key`, persist request key + route + response status/body. Duplicate keys return the stored response. Use a database uniqueness constraint to make retries race-safe.

- [ ] **Step 9: Run tests**

Run:

```bash
pnpm --filter @qnd-health/api test
pnpm typecheck
```

Expected: PASS, including 401/403 and duplicate-key tests.

- [ ] **Step 10: Commit**

```bash
git add packages/activity-model apps/api database
 git commit -m "feat: add scoped Hermes planner API"
```

---

### Task 3: OpenAPI and minimal web planner

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/app.tsx`
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/pages/dashboard.tsx`
- Create: `apps/web/src/pages/planner.tsx`
- Create: `apps/web/src/components/week-planner.tsx`
- Create: `apps/web/src/components/activity-editor.tsx`
- Create: `apps/web/src/app.test.tsx`
- Modify: `apps/api/src/app.ts`
- Create: `apps/api/src/plugins/openapi.ts`
- Create: `apps/api/test/openapi.test.ts`

**Interfaces:**
- Produces: responsive web UI for weekly planned activities.
- Produces: `/api/openapi.json` describing Hermes endpoints and bearer auth.

- [ ] **Step 1: Write failing OpenAPI test**

Assert `/api/openapi.json` returns 200 and includes `/api/v1/plans` plus bearer-security metadata.

- [ ] **Step 2: Write failing web test**

Render the planner with two mocked planned activities and assert both titles and seven day columns are visible.

- [ ] **Step 3: Run tests and verify failures**

Run:

```bash
pnpm --filter @qnd-health/api test -- openapi.test.ts
pnpm --filter @qnd-health/web test
```

Expected: FAIL.

- [ ] **Step 4: Add Fastify Swagger/OpenAPI**

Register route schemas and expose JSON only at `/api/openapi.json`. Document `Authorization: Bearer` and `Idempotency-Key`.

- [ ] **Step 5: Implement web shell and weekly planner**

The first UI supports:

- current week navigation,
- cards grouped by day,
- create planned activity,
- edit planned activity,
- delete planned activity,
- mobile stacked view and desktop seven-column view.

Use the same API; do not duplicate planner rules in React.

- [ ] **Step 6: Run tests and build**

```bash
pnpm --filter @qnd-health/web test
pnpm --filter @qnd-health/web build
pnpm --filter @qnd-health/api test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web apps/api
 git commit -m "feat: add weekly planner UI and OpenAPI"
```

---

### Task 4: Completed activities, FIT import, and matching

**Files:**
- Create: `packages/providers/package.json`
- Create: `packages/providers/src/provider.ts`
- Create: `packages/providers/src/fit/fit-provider.ts`
- Create: `packages/providers/src/manual/manual-provider.ts`
- Create: `apps/api/src/services/activities.ts`
- Create: `apps/api/src/services/matching.ts`
- Create: `apps/api/src/routes/activities.ts`
- Create: `apps/api/src/routes/import.ts`
- Create: `apps/api/test/activities.test.ts`
- Create: `apps/api/test/fit-import.test.ts`
- Create: `apps/api/test/matching.test.ts`
- Create: `apps/web/src/pages/activities.tsx`
- Create: `apps/web/src/pages/activity-detail.tsx`

**Interfaces:**
- Produces: normalized `CompletedActivityInput` independent of source provider.
- Produces: `POST /api/v1/activities` for manual/API creation.
- Produces: FIT upload endpoint for the web UI.
- Produces: `matchActivity(completedActivityId): MatchResult`.

- [ ] **Step 1: Write failing manual activity API tests**

Verify create/list/get behavior and `activities:write` scope enforcement.

- [ ] **Step 2: Write failing FIT parser tests**

Include one small legal test fixture under `apps/api/test/fixtures/activity.fit` and one invalid fixture. Assert a valid file creates exactly one normalized activity and an invalid file creates none.

- [ ] **Step 3: Write failing matching tests**

Test the scoring rules from the design:

- same day +50,
- same sport +30,
- duration similarity up to +10,
- distance similarity up to +10.

Verify ambiguous candidates remain unresolved.

- [ ] **Step 4: Implement provider interface**

```ts
export interface ActivityProvider {
  readonly name: string;
  importActivity(input: unknown): Promise<CompletedActivityInput>;
}
```

Both FIT and manual sources normalize into the same shape.

- [ ] **Step 5: Implement atomic FIT import**

Parse/validate fully before starting the database insert. On parser failure return 422 and persist no activity.

- [ ] **Step 6: Implement match service and Plan vs Actual response**

Expose match metadata in activity detail so the web UI can show planned and actual distance/duration/HR side by side.

- [ ] **Step 7: Add activities UI**

Provide activity list, FIT drop zone, and activity detail view.

- [ ] **Step 8: Run tests**

```bash
pnpm test
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/providers apps/api apps/web
 git commit -m "feat: import and match completed activities"
```

---

### Task 5: Analytics engine and progress API/UI

**Files:**
- Create: `packages/analytics/package.json`
- Create: `packages/analytics/src/adherence.ts`
- Create: `packages/analytics/src/volume.ts`
- Create: `packages/analytics/src/trends.ts`
- Create: `packages/analytics/test/adherence.test.ts`
- Create: `packages/analytics/test/volume.test.ts`
- Create: `packages/analytics/test/trends.test.ts`
- Create: `apps/api/src/services/progress.ts`
- Create: `apps/api/src/routes/progress.ts`
- Create: `apps/api/test/progress.test.ts`
- Create: `apps/web/src/pages/progress.tsx`

**Interfaces:**
- Produces pure functions `calculateAdherence`, `calculateVolumeWindow`, and `calculateMetricTrend`.
- Produces `GET /api/v1/progress/summary` and `/api/v1/progress/trends`.

- [ ] **Step 1: Write failing analytics unit tests**

Cover empty periods, skipped workouts, partial matches, and previous-window comparison.

- [ ] **Step 2: Run and confirm failures**

Run: `pnpm --filter @qnd-health/analytics test`  
Expected: FAIL because analytics functions do not exist.

- [ ] **Step 3: Implement pure deterministic calculations**

Keep date/window selection explicit and timezone-safe. No AI dependency is allowed in this package.

- [ ] **Step 4: Write and implement API tests**

Verify `progress:read` scope, supported `window` values (`7d`, `28d`, `90d`, `180d`, `365d`), and 400 for unsupported windows.

- [ ] **Step 5: Add progress page**

Show adherence, current vs previous volume, plan vs actual totals, and simple trend charts.

- [ ] **Step 6: Run tests/build**

```bash
pnpm test
pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/analytics apps/api apps/web
 git commit -m "feat: add deterministic progress analytics"
```

---

### Task 6: DeepSeek AI Coach

**Files:**
- Create: `packages/coach/package.json`
- Create: `packages/coach/src/types.ts`
- Create: `packages/coach/src/rules.ts`
- Create: `packages/coach/src/deepseek.ts`
- Create: `packages/coach/src/prompt.ts`
- Create: `packages/coach/test/rules.test.ts`
- Create: `packages/coach/test/deepseek.test.ts`
- Create: `apps/api/src/services/coach.ts`
- Create: `apps/api/src/routes/coach.ts`
- Create: `apps/api/test/coach.test.ts`
- Create: `apps/web/src/pages/coach.tsx`

**Interfaces:**
- Produces: `CoachRecommendationSchema` via Zod.
- Produces: `buildCoachContext(...)` from deterministic summaries.
- Produces: `DeepSeekCoach.review(context): Promise<CoachReviewResult>`.
- Produces: review/list/accept/ignore endpoints.

- [ ] **Step 1: Write failing model-response validation tests**

Test valid JSON, malformed JSON, unknown recommendation type, and recommendation exceeding configured local bounds.

- [ ] **Step 2: Write failing acceptance safety test**

A mocked model recommends an invalid increase. Assert `POST /api/v1/coach/recommendations/:id/accept` refuses it and does not mutate a planned activity.

- [ ] **Step 3: Implement prompt/context builder**

Pass:

- user goal,
- next 14 days plan,
- detailed last 7 days,
- aggregated last 28 days,
- long-term trend summary,
- recent coach decisions.

Do not send GPS traces.

- [ ] **Step 4: Implement DeepSeek adapter**

Use server-only `DEEPSEEK_API_KEY`. Request JSON output. Apply timeout and map provider errors to a recoverable `coach_provider_error`.

- [ ] **Step 5: Implement local policy rules**

Initial configurable defaults:

- no consecutive hard sessions,
- at least one rest day per seven days,
- reject negative distance/duration,
- maximum weekly running-volume increase defaults to 10%,
- maximum single long-run distance increase defaults to 1 km.

- [ ] **Step 6: Implement coach API/UI**

UI lists pending recommendations with `Apply`, `Edit`, and `Ignore`. Hermes receives equivalent read/command endpoints with `coach:read`/`coach:write`.

- [ ] **Step 7: Run tests**

```bash
pnpm test
pnpm typecheck
```

Expected: PASS including invalid DeepSeek response tests.

- [ ] **Step 8: Commit**

```bash
git add packages/coach apps/api apps/web
 git commit -m "feat: add DeepSeek assisted coaching"
```

---

### Task 7: Garmin provider boundary and integration-ready implementation

**Files:**
- Create: `packages/providers/src/garmin/garmin-provider.ts`
- Create: `packages/providers/src/garmin/types.ts`
- Create: `packages/providers/test/garmin-provider.test.ts`
- Create: `apps/api/src/routes/integrations.ts`
- Create: `apps/api/src/services/integrations.ts`
- Create: `apps/api/test/integrations.test.ts`
- Create: `apps/web/src/pages/settings-integrations.tsx`
- Create: `docs/api/garmin.md`

**Interfaces:**
- Produces Garmin provider methods that map granted Garmin data to normalized activity/health types.
- Keeps OAuth/client details confined to the provider and backend integration service.

- [ ] **Step 1: Write provider contract tests with mocked Garmin payloads**

Verify Garmin activity records normalize to the same shape used by FIT/manual imports and duplicate provider ids are ignored.

- [ ] **Step 2: Implement provider adapter without coupling domain services**

The rest of QND Health must depend only on provider interfaces. If Garmin credentials are absent, integration status is `not_configured` while FIT/manual remain fully functional.

- [ ] **Step 3: Implement integration status API and settings UI**

Show whether Garmin is configured/connected and provide configuration instructions appropriate to the granted Garmin Connect Developer Program access.

- [ ] **Step 4: Add sync entry points guarded by configuration**

No fake Garmin network calls or undocumented login scraping. Official API wiring is enabled only when required credentials and approved API details are available.

- [ ] **Step 5: Run tests**

```bash
pnpm test
pnpm build
```

Expected: PASS with Garmin disabled by default.

- [ ] **Step 6: Commit**

```bash
git add packages/providers apps/api apps/web docs/api
 git commit -m "feat: add Garmin integration boundary"
```

---

### Task 8: Deployment, end-to-end tests, and Hermes documentation

**Files:**
- Modify: `docker-compose.yml`
- Create: `Dockerfile.api`
- Create: `Dockerfile.web`
- Create: `nginx/default.conf`
- Create: `tests/e2e/planner-hermes.spec.ts`
- Create: `tests/e2e/fit-progress-coach.spec.ts`
- Create: `playwright.config.ts`
- Create: `docs/api/hermes.md`
- Modify: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: one-command self-hosted deployment.
- Produces: documented Hermes curl examples and OpenAPI discovery path.

- [ ] **Step 1: Write E2E test for browser + Hermes shared state**

Flow:

1. create planned activity in web UI,
2. read it through Hermes API,
3. patch it through Hermes API,
4. refresh browser and verify updated value,
5. verify an audit event exists.

- [ ] **Step 2: Write E2E test for FIT -> progress -> coach**

Import fixture, confirm activity match, progress update, mock coach review, and recommendation display.

- [ ] **Step 3: Add production Docker images and reverse proxy**

Compose services:

- `db`
- `api`
- `web`

Expose a single HTTP entry point, document TLS termination options for the user's server/reverse proxy, and avoid exposing PostgreSQL publicly by default.

- [ ] **Step 4: Document Hermes bootstrap**

`docs/api/hermes.md` must include:

```bash
curl -H "Authorization: Bearer $QND_HEALTH_TOKEN" \
  https://health.example/api/v1/plans
```

and examples for create/update with `Idempotency-Key`, scope list, error format, token revocation, and OpenAPI discovery.

- [ ] **Step 5: Run complete verification**

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright test

docker compose config
```

Expected: all tests pass, builds succeed, Compose validates.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: ship self-hosted qnd health MVP"
```

---

## Plan self-review

### Spec coverage

- Self-hosted single-user deployment: Tasks 1 and 8.
- Planner and Hermes CRUD: Tasks 2 and 3.
- Scoped bearer auth, idempotency, audit: Task 2.
- OpenAPI: Task 3.
- Completed activities and FIT fallback: Task 4.
- Matching / Plan vs Actual: Task 4.
- Deterministic analytics: Task 5.
- DeepSeek assisted coaching with local guardrails: Task 6.
- Garmin provider separation and official-integration boundary: Task 7.
- Full deployment and E2E behavior: Task 8.

### Placeholder scan

No implementation task relies on `TBD`, `TODO`, or unspecified generic error handling. Garmin network details are deliberately gated on actual approved Garmin credentials/API access; the provider boundary and disabled-state behavior are fully specified and testable without inventing undocumented endpoints.

### Type consistency

Shared planner/activity/provider interfaces are introduced before later tasks consume them. Hermes and web paths both enter through the same API/domain services.

### Review Focus mapping

- Duplicate idempotency keys: Task 2 tests.
- Missing write scope: Task 2 tests.
- Invalid/revoked token: Task 2 tests.
- Invalid FIT transactionality: Task 4 tests.
- Invalid DeepSeek output / unsafe recommendation: Task 6 tests.
