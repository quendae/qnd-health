# QND Health — Design Specification

**Date:** 2026-09-21  
**Status:** approved direction from prior design conversation, extended for self-hosting and Hermes API

## 1. Product goal

QND Health is a private, single-user, self-hosted web application for planning activities, importing completed workouts, tracking progress, and receiving AI coaching suggestions. Garmin is the first external fitness provider. DeepSeek provides interpretation of calculated metrics and proposes plan changes. Hermes can read and modify the same application data through a first-party API.

The application must remain useful without Garmin approval by supporting manual activity entry and FIT import.

## 2. Deployment assumptions

- Private deployment on the user's own server.
- Single primary human user in v1; no public registration or multi-tenant model.
- Docker Compose is the default deployment method.
- PostgreSQL is the source of truth.
- Browser frontend is a responsive PWA.
- Backend is Node.js + TypeScript.
- Secrets and third-party tokens remain server-side.

## 3. Main subsystems

### 3.1 Web application

Primary views:

- Dashboard
- Weekly / monthly planner
- Activities
- Activity details with Plan vs Actual
- Progress
- AI Coach
- Settings / integrations

The planner supports manual creation, editing, deletion, rescheduling, and drag-and-drop.

### 3.2 Domain API

The web frontend and agent API use the same domain services. Business rules must not live only in UI handlers.

Core entities:

- `PlannedActivity`
- `CompletedActivity`
- `ActivityMatch`
- `DailyHealth`
- `Goal`
- `CoachReview`
- `CoachRecommendation`
- `CoachDecision`
- `ProviderConnection`
- `ApiToken`
- `AuditEvent`

### 3.3 Analytics engine

Statistics are deterministic and calculated by code. Initial metrics:

- planned vs completed activity count
- adherence percentage
- planned vs actual duration and distance
- 7-day and 28-day volume
- current period vs previous period
- pace and heart-rate trends for comparable activities
- missed, moved, replaced, partial, and completed plan status

DeepSeek must not be responsible for arithmetic that can be calculated locally.

### 3.4 DeepSeek AI Coach

DeepSeek receives compact structured summaries rather than raw history dumps.

Review levels:

- post-workout feedback
- weekly review
- monthly review

The model returns machine-readable JSON containing:

- progress state
- confidence
- summary
- recommendations
- warnings

Default coaching mode is **Assisted**: AI proposes changes and the user accepts, edits, or ignores them.

The application validates proposed changes against local rules before applying them. AI cannot bypass those rules.

### 3.5 Garmin provider

Garmin is isolated behind a provider interface.

Initial provider contract must allow:

- importing activities
- importing health / recovery data when access permits
- synchronizing structured workouts later

Before official API access, QND Health supports manual FIT upload and parses it into the same normalized activity model.

## 4. Hermes API

Hermes is a first-class client of QND Health rather than a database user.

### 4.1 Protocol

- REST over HTTPS
- JSON request / response bodies
- versioned prefix: `/api/v1`
- OpenAPI document at `/api/openapi.json`
- health endpoint at `/api/v1/health`

The API is deliberately simple enough for tool-calling agents and shell clients.

### 4.2 Authentication

Hermes uses a dedicated bearer token:

`Authorization: Bearer <token>`

Tokens are stored hashed in the database. Plaintext token values are shown only when created.

Scopes:

- `activities:read`
- `activities:write`
- `plans:read`
- `plans:write`
- `progress:read`
- `coach:read`
- `coach:write`
- `health:read`

A token may have any subset. The initial Hermes token will normally receive all required read/write scopes, but permissions remain explicit.

### 4.3 Initial endpoints

#### Planner

- `GET /api/v1/plans?from=&to=`
- `POST /api/v1/plans`
- `GET /api/v1/plans/:id`
- `PATCH /api/v1/plans/:id`
- `DELETE /api/v1/plans/:id`

#### Completed activities

- `GET /api/v1/activities?from=&to=&type=`
- `POST /api/v1/activities`
- `GET /api/v1/activities/:id`
- `PATCH /api/v1/activities/:id`

Provider-imported raw source records are not directly editable; normalized user-facing fields may be annotated where the domain allows it.

#### Progress

- `GET /api/v1/progress/summary?window=7d|28d|90d|180d|365d`
- `GET /api/v1/progress/trends?metric=`

#### Coach

- `GET /api/v1/coach/reviews`
- `GET /api/v1/coach/recommendations?status=pending|accepted|ignored`
- `POST /api/v1/coach/review`
- `POST /api/v1/coach/recommendations/:id/accept`
- `POST /api/v1/coach/recommendations/:id/ignore`

#### Health

- `GET /api/v1/health/daily?from=&to=`

### 4.4 Idempotency and safe agent writes

For create / command endpoints, Hermes may send:

`Idempotency-Key: <unique-value>`

The backend stores a short-lived record and returns the original result for duplicate keys. This prevents accidental duplicate workouts or repeated recommendation acceptance when an agent retries.

### 4.5 Auditing

Every successful Hermes write records an `AuditEvent` containing:

- timestamp
- API token id
- action
- entity type
- entity id
- request id
- minimal change summary

Sensitive secrets and complete auth headers must never be logged.

### 4.6 Error shape

All API errors use a stable structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "plannedDistance must be greater than zero",
    "details": {}
  },
  "requestId": "..."
}
```

## 5. Data model

### PlannedActivity

- `id`
- `date`
- `activityType`
- `title`
- `plannedDurationSeconds`
- `plannedDistanceMeters`
- `targetHrMin`
- `targetHrMax`
- `targetZone`
- `targetPaceMinSecondsPerKm`
- `targetPaceMaxSecondsPerKm`
- `workoutStructureJson`
- `notes`
- `status`
- `createdAt`
- `updatedAt`

### CompletedActivity

- `id`
- `provider`
- `providerActivityId`
- `activityType`
- `startedAt`
- `durationSeconds`
- `distanceMeters`
- `avgHr`
- `maxHr`
- `avgPaceSecondsPerKm`
- `cadence`
- `elevationGainMeters`
- `calories`
- `sourceFilePath`
- `rawProviderDataJson`
- `createdAt`
- `updatedAt`

### ActivityMatch

- `plannedActivityId`
- `completedActivityId`
- `matchScore`
- `matchSource` (`automatic` or `manual`)
- `createdAt`

### DailyHealth

- `date`
- `sleepDurationSeconds`
- `restingHr`
- `hrv`
- `stress`
- `bodyBattery`
- `steps`
- `calories`
- `source`

### ApiToken

- `id`
- `name`
- `tokenHash`
- `scopes`
- `lastUsedAt`
- `revokedAt`
- `createdAt`

### AuditEvent

- `id`
- `actorType`
- `apiTokenId`
- `action`
- `entityType`
- `entityId`
- `requestId`
- `summaryJson`
- `createdAt`

## 6. Activity matching

Automatic matching uses candidate planned activities within ±1 day.

Initial scoring:

- same calendar day: +50
- same sport: +30
- duration similarity: up to +10
- distance similarity: up to +10

High-confidence matches are linked automatically. Ambiguous matches remain unresolved for manual selection.

## 7. Security

- No DeepSeek, Garmin, database, or session secret in frontend bundles.
- API tokens are hashed and scope-checked.
- HTTPS is required when exposed outside a trusted LAN.
- Optional reverse-proxy IP allow-list may further restrict Hermes.
- CORS defaults to the configured web origin only; Hermes does not require browser CORS.
- Request rate limiting protects auth and agent endpoints.
- GPS traces are not sent to DeepSeek unless explicitly required by a future feature.
- The application provides fitness observations, not medical diagnosis.

## 8. Repository layout

```text
qnd-health/
  apps/
    web/
    api/
  packages/
    activity-model/
    analytics/
    coach/
    providers/
  database/
    migrations/
  docs/
    api/
    superpowers/
      specs/
      plans/
  tests/
  docker-compose.yml
  .env.example
  package.json
  pnpm-workspace.yaml
  README.md
```

## 9. MVP delivery order

### Vertical slice A — core self-hosted planner + Hermes API

- monorepo scaffold
- PostgreSQL
- planned activity CRUD
- minimal dashboard / weekly planner
- Hermes bearer-token auth and scoped CRUD
- OpenAPI
- audit log

### Vertical slice B — completed activities and FIT

- manual completed activity entry
- FIT upload / parsing
- plan-to-actual matching
- activity detail view

### Vertical slice C — analytics and progress

- adherence
- volume windows
- plan vs actual metrics
- progress UI and API

### Vertical slice D — DeepSeek Coach

- structured prompt payload
- JSON response validation
- weekly review
- recommendations
- accept / ignore flow

### Vertical slice E — Garmin

- provider abstraction finalized
- OAuth / credential flow according to granted Garmin API access
- activity and health synchronization
- later: structured workout push

## 10. Acceptance criteria for first usable release

A first usable release is complete when the user can:

1. run the system with Docker Compose,
2. create and edit a planned workout in the web UI,
3. read and change that workout through Hermes API,
4. import or manually record a completed workout,
5. see Plan vs Actual and weekly progress,
6. request a DeepSeek weekly review,
7. accept or ignore an AI recommendation,
8. inspect an audit trail of Hermes writes,
9. use the app without Garmin API access,
10. add Garmin synchronization later without changing the internal activity model.
