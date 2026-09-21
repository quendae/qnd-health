# QND Health Today Hub Slice A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven development. Steps use checkbox syntax.

**Goal:** Ship the first coherent QND Health vertical slice: Today Hub, PlanItem goals, Hermes nutrition/measurement writes, daily aggregate API, scoped agent auth, audit/idempotency, and a responsive web UI.

**Architecture:** TypeScript pnpm monorepo. Fastify owns domain/API validation, Prisma/PostgreSQL is persistent source of truth, React/Vite consumes the same REST API that Hermes uses. Today aggregation is a server-side read model composed from plan items, nutrition, health, measurements and completed-activity candidates.

**Tech Stack:** Node.js 22, TypeScript, pnpm, Fastify, Zod, Prisma, PostgreSQL 16, React 19 + Vite, Vitest, Testing Library, Fastify Swagger, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-21-qnd-health-design.md`

## Global Constraints

- Private single-user deployment; no public registration or multi-tenancy.
- Default route is Today Hub.
- PlanItem completion strategies are `metric_auto`, `count_manual`, `activity_link`, `manual`.
- Nutrition is first-class data; daily totals are derived from entries.
- Hermes has scoped bearer auth, idempotent create/command writes and audit events.
- Garmin/provider secrets never reach browser/Hermes.
- UI follows `DESIGN.md` and `UX-CONTRACT.md`.
- Deterministic math stays out of DeepSeek.

## Review Focus

1. Repeated Hermes POST with same `Idempotency-Key` does not duplicate nutrition or plan items.
2. Read-only token cannot mutate nutrition/plan/measurements.
3. Metric-auto progress cannot be spoofed via normal progress endpoint.
4. Nutrition entries with unknown macros preserve `null`; summaries treat only known numeric values as sums and expose completeness.
5. Today aggregation remains useful when Garmin/health data is absent.

---

### Task 1: Repository, CI, database and health endpoint

**Deliverable:** installable monorepo with CI, PostgreSQL schema, Fastify app and `/api/v1/health`.

**Tests first:** `apps/api/test/health.test.ts` expects `{status:"ok"}`; CI runs API/web tests, typecheck and build.

**Core files:** root workspace/config, `apps/api`, `apps/web`, `database/prisma/schema.prisma`, `.github/workflows/ci.yml`, Docker Compose.

**Schema:** `PlanItem`, `CompletedActivity`, `ActivityMatch`, `DailyHealth`, `BodyMeasurement`, `NutritionEntry`, `ApiToken`, `AuditEvent`, `IdempotencyRecord` plus Coach/provider tables reserved by main spec.

### Task 2: Hermes authentication, scopes, audit and idempotency

**Deliverable:** bearer-token middleware with SHA-256 token hashes, explicit scopes, stable error envelope, request ids, audit service and route-safe idempotency helper.

**Tests first:** 401 missing token; 403 missing scope; revoked token denied; duplicate key returns same result; auth material absent from audit payload.

### Task 3: PlanItem domain and API

**Deliverable:** CRUD plus progress and activity-link commands.

**Validation:**

- `metric_auto` requires `metricKey` + positive `targetValue` and rejects manual current-value writes.
- `count_manual` accepts non-negative progress and auto-derives Planned/Partial/Completed unless explicit terminal override applies.
- `activity_link` is completed when linked to one completed activity.
- `manual` can toggle completion explicitly.

**Tests first:** steps goal, stair loops progression `5/8 -> partial`, `8/8 -> completed`, metric spoof rejection.

### Task 4: Nutrition and body measurements API

**Deliverable:** Hermes/manual CRUD for NutritionEntry, derived daily nutrition summary, measurement create/list, scopes/audit/idempotency.

**Tests first:** chronological entries; kcal/protein/carbs/fat sums; null macro preservation/completeness; duplicate idempotency; latest weight selection.

### Task 5: Today aggregate and activity candidates

**Deliverable:** `GET /api/v1/today?date=` read model.

**Returns:** date, plan items with calculated progress, candidate activities for unresolved `activity_link`, nutrition entries/summary, DailyHealth when present, latest body measurement, week-to-date lightweight summary and remaining-week plan.

**Tests first:** no-health graceful response; steps auto-completion from DailyHealth; candidate ranking; week boundaries.

### Task 6: OpenAPI

**Deliverable:** `/api/openapi.json` with bearer scheme, scopes documented in descriptions, Today/plan/nutrition/measurement schemas and `Idempotency-Key` on mutating routes.

**Tests first:** key paths and bearer security definition exist.

### Task 7: Today Hub web UI

**Deliverable:** responsive app shell and Today route following `DESIGN.md`.

**Desktop:** health quick strip; 55/45 Activity/Nutrition split; Day Spine motif; week-to-date rail; remaining-week agenda; Coach placeholder clearly marked unavailable until Slice D.

**Activity:** metric goal, count controls, manual completion, activity-link suggestions.

**Nutrition:** calorie/macro summary and chronological meals with Hermes provenance.

**Tests first:** semantic headings, sample 7500-step goal progress, `5 / 8 loops`, nutrition summary, candidate attach action, mobile-safe DOM order.

### Task 8: Planner/History navigation skeleton and deployment docs

**Deliverable:** routes that establish information architecture without fake analytics: Today works fully; Planner and History expose real Slice-A data; Progress/Coach explain not yet populated. README documents Docker, first token creation, Hermes examples and security boundary.

**Tests first:** navigation route smoke tests and no secret in browser bundle config.

### Verification

- CI must pass tests, typecheck and production build.
- Static accessibility checks through Testing Library semantics.
- Browser/BrowserAct visual verification is required when a runnable deployment/browser target is available; until then runtime visual sign-off remains explicitly pending.
