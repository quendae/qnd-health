# QND Health — Design Specification

**Date:** 2026-09-21  
**Status:** approved direction, refined for Today Hub, nutrition, Hermes, and full Garmin context

## 1. Product goal

QND Health is a private, single-user, self-hosted health and activity cockpit. The primary screen is **Today** rather than a generic analytics dashboard. It combines the user's training/activity plan, nutrition reported by Hermes, current health/recovery context, and week-to-date progress in one place.

Garmin is the primary objective health/activity source. Hermes is a first-class read/write client and is expected to provide nutrition data and may also maintain weight or notes. DeepSeek acts as an AI Coach over deterministic summaries calculated by QND Health.

The application must remain useful before official Garmin API access by supporting manual data entry and FIT import.

## 2. Deployment assumptions

- Private deployment on the user's own server.
- Single primary human user in v1; no public registration or multi-tenant model.
- Docker Compose is the default deployment method.
- PostgreSQL is the source of truth.
- Browser frontend is a responsive PWA.
- Backend is Node.js + TypeScript.
- Secrets and third-party tokens remain server-side.
- UI language can start in English internally; copy must be centralized so Polish localization can be added without restructuring screens.

## 3. Primary information architecture

### 3.1 Today Hub — default route

The first useful viewport answers:

1. What do I need to do today?
2. What has already been completed?
3. What have I eaten today?
4. What does Garmin currently say about recovery/health?
5. How is this week progressing?
6. What remains for the rest of the week?

Desktop layout:

```text
+------------------------------------------------------------------+
| TODAY · date navigation                     health quick strip     |
+--------------------------------+---------------------------------+
| ACTIVITY                       | NUTRITION                       |
|                                |                                 |
| 7500 steps        6120 / 7500  | kcal        1480 / target       |
| stairs 8 loops    5 / 8        | protein     104 g               |
| easy run          waiting      | carbs       136 g               |
| [attach Garmin activity]       | fat          54 g               |
|   suggested activities...      |                                 |
|                                | meals from Hermes timeline      |
+--------------------------------+---------------------------------+
| WEEK TO DATE                                                     |
| completed goals · volume · steps · nutrition · recovery trend    |
+------------------------------------------------------------------+
| REST OF WEEK                                                     |
| Tue ... Wed ... Thu ... Fri ... Sat ... Sun ...                  |
+------------------------------------------------------------------+
| AI COACH                                                        |
| concise observation + recommendation + review/apply              |
+------------------------------------------------------------------+
```

On narrow screens the same hierarchy becomes a vertical flow: Activity → Nutrition → Week to date → Remaining week → Coach.

### 3.2 History

Historical browsing covers all first-party normalized data:

- plan items and completion state,
- Garmin / FIT / manual activities,
- daily health and recovery,
- nutrition entries and daily nutrition summaries,
- body measurements,
- coach reviews and accepted/ignored recommendations.

Provide day, week, month, and trend-oriented navigation rather than separate disconnected archives.

### 3.3 Planner

Planner supports weekly/monthly planning and Today-item editing.

A `PlanItem` may represent:

- structured workout,
- metric goal such as `steps >= 7500`,
- count goal such as `stairs_loops >= 8`,
- simple manual completion item.

Completion strategies:

- `metric_auto` — calculated from normalized health metrics,
- `count_manual` — progress updated by UI or Hermes,
- `activity_link` — completed by linking a Garmin/FIT/manual activity,
- `manual` — explicit done/not-done.

The UI must show unresolved `activity_link` items with candidate completed activities and allow one-click linking.

## 4. Domain model

The web frontend and Hermes API use the same domain services. Business rules never live only in UI handlers.

Core entities:

- `PlanItem`
- `CompletedActivity`
- `ActivityMatch`
- `DailyHealth`
- `BodyMeasurement`
- `NutritionEntry`
- `NutritionDailySummary` (derived/cacheable, not an independent source of truth)
- `Goal`
- `CoachReview`
- `CoachRecommendation`
- `CoachDecision`
- `ProviderConnection`
- `ProviderSyncCursor`
- `ApiToken`
- `AuditEvent`

### 4.1 PlanItem

Key fields:

- `id`
- `date`
- `kind`: `workout | metric_goal | count_goal | manual`
- `activityType` (nullable for non-workout goals)
- `title`
- `completionStrategy`: `metric_auto | count_manual | activity_link | manual`
- `metricKey` (for example `steps`, `floors_ascended`)
- `targetValue`
- `currentManualValue`
- `unit`
- `plannedDurationSeconds`
- `plannedDistanceMeters`
- HR/pace/zone targets
- `workoutStructureJson`
- `notes`
- `status`: `planned | partial | completed | skipped | moved | replaced`
- timestamps

### 4.2 CompletedActivity

- `id`
- `provider`: `garmin | fit | manual | hermes`
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
- normalized optional sport metrics
- `sourceFilePath`
- `rawProviderDataJson`
- timestamps

### 4.3 DailyHealth

QND Health should normalize as much Garmin health context as granted by the API while preserving the original provider payload server-side.

Normalized fields should include when available:

- date
- steps
- floors / stairs metrics
- intensity minutes
- resting HR
- HRV
- stress
- Body Battery / comparable energy metric
- sleep duration and sleep stages
- respiration
- Pulse Ox / SpO2
- calories / active calories
- hydration if available
- recovery/training readiness-related values when granted
- source
- `rawProviderDataJson`

The schema may evolve as Garmin grants additional datasets; raw provider payload retention prevents data loss while normalized columns support deterministic analytics.

### 4.4 BodyMeasurement

- timestamp/date
- weight kg
- optional body fat / BMI / muscle metrics when available
- source: `garmin | hermes | manual`
- raw provider data when applicable

The latest measurement is exposed prominently to analytics and Coach context.

### 4.5 NutritionEntry

Hermes is expected to be the primary writer, but manual UI entry is allowed.

Fields:

- `id`
- `consumedAt`
- `mealType`: `breakfast | lunch | dinner | snack | other`
- `title`
- `caloriesKcal`
- `proteinGrams`
- `carbsGrams`
- `fatGrams`
- optional `fiberGrams`
- optional `quantityText`
- optional notes
- source: `hermes | manual`
- timestamps

Daily calories and macros are deterministic sums over entries.

## 5. Garmin integration

Garmin remains isolated behind a provider interface.

The goal is to import **all useful datasets made available by the granted Garmin APIs**, not only workouts. Data should include activities, daily health/recovery, body measurements, and additional fitness metrics when accessible.

Rules:

- Preserve raw provider records server-side.
- Normalize fields needed by UI, analytics, goal completion, and AI Coach.
- Do not expose Garmin credentials to the browser or Hermes.
- Keep sync cursors/idempotency so repeated provider delivery does not duplicate records.
- A future structured-workout outbound integration must use the same `PlanItem` source model.

Before official API access, FIT upload normalizes activities into `CompletedActivity`.

## 6. Analytics engine

Statistics are deterministic and calculated by code.

Initial metrics:

- plan-item completion and adherence,
- goal progress by metric/count/activity-link,
- planned vs actual duration and distance,
- 7-day and 28-day activity volume,
- current vs previous period,
- pace and HR trends for comparable activities,
- steps and other daily-movement trends,
- resting-HR / HRV / sleep / recovery trends,
- weight trend,
- calorie and macro summaries/trends,
- correlation-ready summarized context for Coach (without claiming medical causation).

DeepSeek must not perform arithmetic that can be calculated locally.

## 7. DeepSeek AI Coach

DeepSeek receives compact structured summaries rather than raw history dumps. The Coach should have access to all **relevant normalized context** available to QND Health, including:

- current and historical plan adherence,
- completed activities and performance trends,
- Garmin health/recovery data,
- current weight and body-measurement trend,
- nutrition totals and recent patterns,
- upcoming plan,
- prior Coach recommendations and user decisions.

Raw GPS tracks, auth secrets, and irrelevant provider payload fields are excluded from AI context.

Review levels:

- post-workout feedback,
- daily observation when meaningful,
- weekly review,
- monthly review.

Model output is machine-readable JSON containing progress state, confidence, summary, observations, recommendations, and warnings.

Default coaching mode is **Assisted**. AI proposes changes; the user accepts, edits, or ignores them. Application-level rules validate every applied recommendation.

The system provides fitness/wellness observations and must not diagnose disease.

## 8. Hermes API

Hermes is a first-class client rather than a database user.

### 8.1 Protocol and auth

- REST over HTTPS
- JSON bodies
- prefix `/api/v1`
- OpenAPI `/api/openapi.json`
- bearer token `Authorization: Bearer <token>`
- token hashes stored in PostgreSQL
- plaintext token shown only on creation
- `Idempotency-Key` supported for create/command requests

Scopes:

- `today:read`
- `plans:read`
- `plans:write`
- `activities:read`
- `activities:write`
- `nutrition:read`
- `nutrition:write`
- `measurements:read`
- `measurements:write`
- `health:read`
- `progress:read`
- `coach:read`
- `coach:write`

### 8.2 Today

- `GET /api/v1/today?date=YYYY-MM-DD`

Returns the same normalized daily aggregate used by the Today Hub: plan items, completion/progress, linked/suggested activities, nutrition totals/entries, health snapshot, latest body measurement, and week-to-date summary.

### 8.3 Planner

- `GET /api/v1/plans?from=&to=`
- `POST /api/v1/plans`
- `GET /api/v1/plans/:id`
- `PATCH /api/v1/plans/:id`
- `DELETE /api/v1/plans/:id`
- `POST /api/v1/plans/:id/progress` for count/manual progress
- `POST /api/v1/plans/:id/link-activity`
- `DELETE /api/v1/plans/:id/link-activity`

### 8.4 Activities

- `GET /api/v1/activities?from=&to=&type=`
- `POST /api/v1/activities`
- `GET /api/v1/activities/:id`
- `PATCH /api/v1/activities/:id` for allowed annotations/normalized fields

### 8.5 Nutrition

- `GET /api/v1/nutrition?from=&to=`
- `POST /api/v1/nutrition`
- `GET /api/v1/nutrition/:id`
- `PATCH /api/v1/nutrition/:id`
- `DELETE /api/v1/nutrition/:id`
- `GET /api/v1/nutrition/summary?date=`

### 8.6 Measurements and health

- `GET /api/v1/measurements?from=&to=`
- `POST /api/v1/measurements`
- `GET /api/v1/health/daily?from=&to=`

### 8.7 Progress and Coach

- `GET /api/v1/progress/summary?window=7d|28d|90d|180d|365d`
- `GET /api/v1/progress/trends?metric=`
- `GET /api/v1/coach/reviews`
- `GET /api/v1/coach/recommendations?status=pending|accepted|ignored`
- `POST /api/v1/coach/review`
- `POST /api/v1/coach/recommendations/:id/accept`
- `POST /api/v1/coach/recommendations/:id/ignore`

### 8.8 Auditing and safe writes

Every successful Hermes write creates `AuditEvent` with timestamp, token id, action, entity type/id, request id, and minimal change summary. Secrets and auth headers are never logged.

Duplicate idempotency keys for the same route return the original result rather than repeating side effects.

All errors use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "targetValue must be greater than zero",
    "details": {}
  },
  "requestId": "..."
}
```

## 9. Activity matching and candidate suggestions

For an unresolved `activity_link` plan item, candidate activities are ranked using:

- same calendar day: +50
- same sport/category: +30
- duration similarity: up to +10
- distance similarity: up to +10

High-confidence matches may be linked automatically when configured. Otherwise Today Hub shows the best candidates with enough detail to distinguish them and a manual link action.

## 10. UI design direction

QND Health is a personal instrument panel, not a generic SaaS dashboard.

Principles:

- Today is the focal surface; history and settings are secondary navigation.
- Activity and Nutrition are visually parallel but not identical card grids.
- Data typography should make progress values easy to scan.
- Use open sections, rails, dividers, and lists rather than nested cards everywhere.
- Completion always has icon/text/state in addition to color.
- Health/recovery quick metrics stay compact so they support rather than dominate the daily plan.
- Mobile recompiles the information hierarchy instead of shrinking desktop columns.
- WCAG 2.2 AA, visible keyboard focus, reduced-motion support, semantic controls.

The durable visual token system is maintained in project-root `DESIGN.md`; behavioral conventions in `UX-CONTRACT.md`.

## 11. Security

- No DeepSeek, Garmin, database, or session secret in frontend bundles.
- API tokens are hashed and scope-checked.
- HTTPS is required when exposed outside a trusted LAN.
- Optional reverse-proxy IP allow-list may further restrict Hermes.
- CORS defaults to configured web origin only; Hermes does not require browser CORS.
- Request rate limiting protects auth and agent endpoints.
- GPS traces are not sent to DeepSeek unless a future feature explicitly requires them.
- Nutrition and health data are treated as private health/wellness information and should be minimized in logs.

## 12. Repository layout

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
    prisma/
  docs/
    api/
    superpowers/
      specs/
      plans/
  tests/
  DESIGN.md
  UX-CONTRACT.md
  docker-compose.yml
  .env.example
  package.json
  pnpm-workspace.yaml
  README.md
```

## 13. MVP delivery order

### Slice A — Today Hub + Hermes daily data

- monorepo/API/web foundation
- Today Hub visual shell
- `PlanItem` CRUD and progress
- Nutrition CRUD
- body measurements
- `GET /today` aggregate
- Hermes bearer auth/scopes/idempotency/audit
- OpenAPI

### Slice B — completed activities and matching

- manual completed activity entry
- FIT upload/parsing
- candidate matching and manual link
- Plan vs Actual

### Slice C — analytics/history

- week-to-date summary
- remaining-week view
- history browsing
- adherence, volume, health, weight, and nutrition trends

### Slice D — DeepSeek Coach

- deterministic Coach context builder
- JSON response validation
- daily/weekly/monthly reviews
- recommendation apply/edit/ignore

### Slice E — Garmin

- provider sync boundary
- OAuth/credential flow according to granted Garmin API access
- activity + health + body metric sync using all useful granted datasets
- sync diagnostics
- later structured-workout push

## 14. First usable release acceptance criteria

The release is usable when the user can:

1. open QND Health and land on Today Hub,
2. see today's Activity and Nutrition side by side on desktop,
3. track a steps goal and a manual/count goal such as stair loops,
4. create a workout item and link a suggested completed activity,
5. have Hermes create/read/update/delete nutrition entries via scoped API,
6. have Hermes read and update Today-plan information,
7. see current Garmin/FIT/manual health/activity context where available,
8. see week-to-date progress and the remaining week's plan,
9. browse historical health/activity/nutrition/measurement data,
10. inspect an audit trail of Hermes writes,
11. request a DeepSeek review based on locally calculated summaries,
12. run without Garmin API access and add Garmin later without changing the core data model.
