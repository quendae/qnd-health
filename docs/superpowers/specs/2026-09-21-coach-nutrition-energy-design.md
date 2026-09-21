# QND Health — Steps, Nutrition CRUD, Energy Metrics and DeepSeek Coach

Date: 2026-09-21
Status: Approved design, pending implementation plan
Branch: `feat/today-hub-mvp`

## 1. Goal

Extend the current QND Health MVP so it becomes more useful as a daily health cockpit rather than only a read-only dashboard.

This slice has five outcomes:

1. Steps are always visible in the Activity section, with a Garmin/HA-derived goal when available and a fallback goal of 7,500 steps.
2. Nutrition becomes editable from both the UI and API, while the Today presentation is simplified and numeric output is human-readable.
3. Body Battery is removed from the primary health strip and replaced with energy-expenditure information based on BMR/TDEE.
4. Additional Garmin metrics such as VO2 max, Garmin BMR and floors descended are preserved instead of discarded.
5. DeepSeek becomes an interactive Coach with chat, normalized health context and controlled tool access that can perform explicit user-requested changes.

The user-facing UI remains Polish.

## 2. Existing foundation

The current implementation already provides:

- Fastify API with scoped bearer tokens, audit logging and idempotency support,
- Prisma + SQLite persistence,
- Today, Planner, History, Progress and Settings views,
- Garmin/Home Assistant ingestion for daily health, activities and body measurements,
- nutrition create/list/summary endpoints,
- plan CRUD,
- activity import and linking,
- initial `CoachReview`, `CoachRecommendation` and `CoachDecision` tables.

The new work extends these flows rather than adding a parallel subsystem.

## 3. Product principles

### 3.1 Missing data remains unknown

A missing health or nutrition value must remain `null`/unknown. It must never be silently converted to zero.

### 3.2 Human-readable precision

The UI must not expose floating-point artifacts such as `120.600000000001 g`.

Default presentation:

- macros: one decimal place when needed, otherwise integer-like output,
- calories: whole kcal unless a source genuinely requires decimal precision,
- weight: one decimal place,
- percentages: one decimal place only where useful.

Stored values retain their original numeric precision.

### 3.3 Source provenance is preserved

Values imported from Garmin through Home Assistant remain Garmin data with `transport=home_assistant`. Model-generated or user-entered data must not overwrite provenance.

### 3.4 Coach actions use the same application services as UI/API

DeepSeek must never mutate SQLite directly. All changes go through the same domain/service layer as authenticated UI/Hermes operations, including validation, audit and idempotency behavior.

## 4. Steps in Activity

### 4.1 Permanent steps row

The Activity widget on Today always renders a steps row before planned activities.

It shows:

- current steps,
- target steps,
- percentage/progress bar,
- source label,
- fallback indication when the goal is not provider-supplied.

Example:

`Kroki 6 420 / 7 500 · 86%`

### 4.2 Goal precedence

Resolve the daily step goal in this order:

1. Garmin/Home Assistant daily step-goal metric, if ingested and valid,
2. QND Health user-configured default step goal,
3. hard fallback: `7500`.

The fallback must not create a synthetic Garmin value.

### 4.3 Persistence

Add a normalized optional daily metric for provider step goal, e.g. `stepsGoal` in `DailyHealth`.

Add a user-settings record for defaults such as `defaultStepsGoal=7500`. The implementation may start with a single-user settings table because the deployment is currently single-user.

Garmin/HA ingestion may update `stepsGoal` when Home Assistant exposes it.

## 5. Nutrition redesign

### 5.1 Today presentation

Remove time and meal type from the primary meal list.

Each entry should primarily show:

- title,
- calories,
- compact macros,
- edit action,
- delete action.

Example:

`Chleb wiejski Społem   268 kcal`
`B 5,6 · W 53 · T 1,6`

Time and `mealType` remain stored for API/backward compatibility but are treated as optional metadata, not core visual information.

### 5.2 Create semantics

API should no longer force external clients to invent meaningful meal times/types.

For new nutrition entries:

- `consumedAt` may be omitted; server assigns the current timestamp in `Europe/Warsaw`,
- `mealType` may be omitted; server defaults to `other`,
- clients may still provide either field.

This preserves compatibility with Hermes while removing fake `12:00` as a required convention.

### 5.3 Nutrition CRUD API

Add:

- `PATCH /api/v1/nutrition/:id`
- `DELETE /api/v1/nutrition/:id`

PATCH supports partial changes to:

- title,
- calories,
- protein,
- carbohydrates,
- fat,
- fiber,
- quantity text,
- notes,
- optional consumed timestamp,
- optional meal type.

DELETE removes a nutrition entry by ID.

Both operations require `nutrition:write`, are audited, and use the existing safe-write/idempotency conventions.

### 5.4 UI editing

Today nutrition entries receive Edit/Delete controls.

Editing opens a compact dialog with fields for title, kcal, protein, carbs, fat, fiber and optional quantity/notes. Time/type are hidden under optional metadata rather than being primary fields.

Deletion initiated explicitly by the user may proceed after a lightweight confirmation in the UI.

### 5.5 Hermes compatibility

Hermes can correct an existing entry through PATCH instead of creating a conflicting replacement.

OpenAPI must clearly document update/delete operations so Hermes can discover them without hardcoded prompt knowledge.

## 6. Energy metrics: BMR and TDEE

### 6.1 Primary health strip

Remove Body Battery from the default top health strip.

Replace it with TDEE.

Default metric strip becomes approximately:

- weight,
- resting heart rate,
- HRV,
- sleep,
- TDEE.

Body Battery is still retained in DailyHealth and can remain available in History/Progress or configurable widgets.

### 6.2 Profile data required for BMR

Add a single-user Health Profile containing at minimum:

- date of birth or age basis,
- sex used by the BMR equation,
- height in cm,
- optional default activity factor,
- default step goal.

The profile is user-editable in Settings.

No BMR calculation should be shown until the required profile fields and weight are available.

### 6.3 BMR formula

Use Mifflin-St Jeor as the default calculated BMR.

For male physiology:

`BMR = 10 × weightKg + 6.25 × heightCm - 5 × ageYears + 5`

For female physiology:

`BMR = 10 × weightKg + 6.25 × heightCm - 5 × ageYears - 161`

The result is an estimate and the UI/Coach context must treat it as such.

### 6.4 TDEE strategy

Phase 1 TDEE:

- calculated BMR × configurable activity factor,
- default factor must be explicit in Settings rather than hidden.

Phase 2, once enough Garmin data exists:

- use measured/estimated daily expenditure from Garmin where appropriate,
- compare it with calculated TDEE,
- do not silently mix measured calories with formula-derived estimates.

The Today card should identify whether TDEE is `szacowane` or provider-derived.

### 6.5 Garmin BMR sensor

If Garmin/Home Assistant exposes BMR, store it as a provider metric but do not automatically replace calculated Mifflin-St Jeor BMR.

This allows comparison and later calibration.

## 7. Additional Garmin metrics

Preserve currently unmapped useful metrics, including at least:

- VO2 max,
- Garmin BMR,
- floors descended,
- sleep score,
- training readiness/status where available,
- recovery time where available.

Use normalized dedicated fields only for metrics that are immediately useful across Today/History/Progress. Less mature provider-specific values can remain in a structured JSON field.

Minimum additions for this slice:

- `stepsGoal`,
- `floorsDescended`,
- `vo2Max`,
- `providerBmrKcal`.

Garmin/Home Assistant ingestion API must accept them.

## 8. DeepSeek Coach architecture

### 8.1 UI

Coach receives a dedicated chat screen in the existing `Coach` navigation section.

Today retains a compact Coach widget showing:

- short current assessment,
- one or two actionable observations,
- a button/link to open full chat.

### 8.2 Backend boundary

The browser never calls DeepSeek directly.

Flow:

`Browser -> QND Health API -> Coach service -> DeepSeek API`

DeepSeek API credentials stay server-side in environment configuration.

### 8.3 Context builder

Before each model request, backend builds a normalized, bounded context rather than sending raw database/provider dumps.

Context may include:

- current local date,
- profile data relevant to calculations,
- Today summary,
- current plans/goals,
- current steps/goal,
- recent activities,
- recent nutrition totals and entries when relevant,
- recent weight trend,
- sleep/RHR/HRV trends,
- BMR/TDEE estimates and provenance,
- 7/30-day progress summaries.

GPS tracks, raw Garmin payloads and unrelated history are excluded.

### 8.4 System prompt personality

The Coach system prompt defines it as a professional personal trainer and healthy-lifestyle coach.

Behavioral requirements:

- communicates in Polish,
- evaluates performance strictly but fairly,
- avoids empty praise and motivational clichés,
- criticizes execution/behavior, not the person,
- grounds judgments in concrete metrics and trends,
- distinguishes measured data from estimates,
- does not invent missing values,
- prioritizes consistency and gradual progression,
- does not diagnose medical conditions,
- clearly flags uncertainty and recommends professional medical review when appropriate.

Example evaluation style:

- preferred: `Cel kroków wykonany 4/7 dni; średnia spadła z 8 200 do 6 100.`
- avoid: `Musisz bardziej się starać.`

### 8.5 Action policy: Option A

Coach is action-oriented.

When the user gives an explicit, unambiguous instruction, Coach executes it immediately and reports what changed.

Examples:

- `Jutro ustaw 8000 kroków.`
- `Dodaj dzisiaj 30 minut spaceru.`
- `Przenieś trening na środę.`
- `Popraw ten posiłek na 80 g.`
- `Usuń ten posiłek.`

No additional confirmation is required for an explicit user-directed action.

When Coach itself proposes a significant change, especially deletion or a substantial training/diet change, it does not silently execute it. It presents the proposal and rationale first.

If intent is ambiguous or multiple records match, Coach asks a focused clarification rather than guessing.

### 8.6 Coach tools

The first tool set should cover existing application capabilities rather than inventing a separate Coach-specific mutation model.

Read tools:

- `get_today`
- `get_progress`
- `get_history`
- `list_plans`
- `list_activities`
- `list_nutrition`
- `get_profile`

Write tools:

- `create_plan`
- `update_plan`
- `delete_plan`
- `set_plan_progress`
- `attach_activity`
- `create_custom_activity`
- `create_nutrition`
- `update_nutrition`
- `delete_nutrition`
- `create_measurement`
- `update_profile`
- `set_default_step_goal`

Tool execution uses internal application services that enforce the same validation and audit semantics as REST endpoints.

### 8.7 Audit and action summaries

Every Coach mutation records:

- actor type `coach`,
- conversation/request ID,
- action name,
- entity type/ID,
- compact before/after summary when practical.

After tool execution the model receives the tool result and tells the user precisely what changed.

### 8.8 Conversation persistence

Add a minimal Coach conversation/message model so chat survives page reloads.

Store:

- conversation ID,
- created/updated timestamps,
- user and assistant messages,
- model identifier,
- tool call/result metadata stripped of secrets.

Do not store API keys or raw Authorization headers.

## 9. Coach API

Initial endpoints:

- `GET /api/v1/coach/conversations`
- `POST /api/v1/coach/conversations`
- `GET /api/v1/coach/conversations/:id/messages`
- `POST /api/v1/coach/conversations/:id/messages`

Scopes:

- reads: `coach:read`,
- sending a chat message/tool-executing turn: `coach:write`.

The message endpoint returns the assistant response plus a compact list of actions performed in that turn.

Streaming responses are optional for the first implementation. Correct tool execution and auditability take precedence over token streaming.

## 10. Error handling

### Nutrition

- PATCH unknown ID -> 404,
- DELETE unknown ID -> 404,
- invalid nutrition values -> 422,
- safe-write idempotency conflicts follow existing 409 behavior.

### Coach

- missing DeepSeek configuration -> clear 503-like integration error, not a fake Coach response,
- DeepSeek timeout/provider failure -> no mutation unless a tool call already completed; completed actions are reported accurately,
- invalid model tool arguments -> rejected by application validation and returned to the model as a tool error,
- ambiguous target -> Coach asks user rather than executing.

## 11. Security and privacy

- DeepSeek key is server-side only.
- Browser uses the existing QND web token.
- Coach receives normalized summaries, not raw Garmin/Home Assistant payloads.
- No GPS tracks are sent to the model by default.
- Tool calls are allow-listed.
- The model cannot execute arbitrary HTTP, SQL, shell commands or arbitrary endpoint paths.
- All writes are auditable.

## 12. UI details

### Today Activity

Steps row is visually permanent and not dependent on Planner content.

Planned/custom activities continue below it.

### Today Nutrition

Remove the visible time/type columns/labels.

Use compact rounded numeric formatting.

Add edit/delete affordances that do not dominate the panel.

### Health strip

Replace Body Battery with TDEE and show an estimate/provider hint.

### Coach

Dedicated chat view should visually match the existing calm health cockpit. Avoid generic chatbot bubbles taking over the entire product aesthetic; use readable conversation rows with clear action/result callouts.

## 13. OpenAPI and Hermes

OpenAPI must be updated for:

- optional nutrition timestamp/type on create,
- nutrition PATCH/DELETE,
- new Garmin/HA daily metrics,
- profile read/update,
- Coach chat endpoints where appropriate.

Hermes should be able to discover nutrition corrections through OpenAPI without special prompt-only knowledge.

Hermes and Coach remain separate actors:

- Hermes is an external integration agent using bearer scopes,
- Coach is an internal QND Health feature using the model/tool layer.

Both ultimately operate on the same domain data.

## 14. Testing strategy

Use TDD for each behavior.

Backend tests:

- step-goal precedence and 7,500 fallback,
- Garmin ingestion of new metrics,
- nutrition PATCH/DELETE + validation + audit/idempotency,
- optional consumedAt/mealType defaults,
- Mifflin-St Jeor BMR calculations,
- TDEE provenance and activity factor,
- profile validation,
- Coach context excludes raw provider payloads/GPS,
- explicit Coach command maps to allowed tool and mutates expected entity,
- ambiguous command does not mutate,
- model cannot invoke unknown tools,
- Coach mutations create audit records.

Frontend tests:

- permanent steps row even when no plans exist,
- macro formatting removes floating artifacts,
- nutrition edit/delete flows,
- TDEE replaces Body Battery in the default strip,
- chat displays tool actions/results clearly.

Existing full CI gates remain required:

- tests,
- typecheck,
- production build,
- runtime smoke,
- native SQLite smoke,
- Docker compatibility build.

## 15. Delivery order

Implementation plan should preserve this order to reduce risk:

1. Nutrition CRUD and number formatting.
2. Permanent steps row + step-goal persistence/fallback.
3. Health Profile + BMR/TDEE.
4. Additional Garmin metrics ingestion.
5. Coach data models/context builder/system prompt.
6. DeepSeek client + allow-listed tools.
7. Coach chat API and UI.
8. OpenAPI/Hermes documentation and end-to-end verification.

This allows useful UI/API improvements to ship even if DeepSeek integration needs additional provider-specific work.

## 16. Explicit non-goals for this slice

- medical diagnosis,
- autonomous deletion/restructuring of plans without user direction,
- arbitrary code/tool execution by DeepSeek,
- direct browser-to-DeepSeek calls,
- replacing the Garmin/Home Assistant bridge before official Garmin API access arrives,
- advanced calorie expenditure modeling beyond a clearly labeled Phase 1 TDEE estimate,
- multi-user authentication/accounts.
