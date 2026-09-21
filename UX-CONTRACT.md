# QND Health — UX Contract

## Scope

This contract defines observable behavior across the authenticated single-user application. `DESIGN.md` owns visual intent; this document owns interaction, state, feedback and recovery behavior.

## App shell

Primary navigation:

- Today
- Planner
- History
- Progress
- Coach
- Settings

`Today` is the default route.

Navigation preserves unsaved-edit warnings and does not silently discard user input.

## Shared operation rules

### Save

- label: `Save`
- pending: control dimensions remain stable; show busy state
- success: update local view and show concise shared toast
- failure: preserve entered data and show inline correction/retry guidance

### Delete

- use an app-owned confirmation dialog when deleting persistent entries
- dialog names the item and consequence
- primary destructive action is labeled `Delete`
- restore focus to the initiating control after cancel/close

### Completion

Plan-item completion uses the same state vocabulary everywhere:

- Planned
- Partial
- Completed
- Skipped
- Moved
- Replaced

Color never communicates status alone.

## Today Hub

### Date navigation

- previous/next-day buttons are semantic buttons
- `Today` returns to current local date
- changing date updates Activity, Nutrition, health snapshot and relevant weekly context together
- URL reflects selected date as `?date=YYYY-MM-DD` when not current day

### Activity section

Each plan item exposes only actions appropriate to its completion strategy.

#### `metric_auto`

- progress is read-only in normal UI
- current value is calculated from normalized health data
- user may edit the goal definition, not provider-derived current progress

#### `count_manual`

- user can increment/decrement/set current progress
- progress persists immediately through the domain API
- reaching target marks item Completed
- dropping below target returns it to Partial unless explicitly Skipped/Moved/Replaced

#### `activity_link`

- unresolved item shows `Attach activity`
- candidate list is ranked and displays start time, sport, duration, distance and source
- selecting a candidate links exactly one completed activity by default
- explicit `Change activity` allows replacement
- unlinking requires a deliberate action but not a destructive confirmation because it is reversible

#### `manual`

- toggle to Complete is explicit and reversible

### Nutrition section

- daily total is derived from entries; it is not directly editable
- meals are chronological
- entries show title, calories, macros when known, time and source
- Hermes-created entries are editable in UI unless future provenance rules explicitly lock them
- missing macros are displayed as unknown, never coerced to zero in detail views

### Health quick strip

- provider data is read-only in normal UI
- manual/Hermes body measurements can be corrected from History/detail flows
- stale data must show source timestamp/date rather than appearing current

## Planner

- week and month views edit the same `PlanItem` records used by Today
- moving an item changes its date and records audit context
- drag interactions always have keyboard/menu alternatives
- create/edit forms own validation; no browser validation bubbles

## History

History can be filtered by date range and data family:

- plan
- activities
- nutrition
- health
- measurements
- coach

Committed filters persist in URL search parameters.

Every history view defines loading, empty, no-results, error and success states without large layout jumps.

## Coach

- AI output is always visually separated from measured facts
- recommendations display rationale and affected plan items
- `Apply`, `Edit`, and `Ignore` use consistent labels everywhere
- applying a recommendation revalidates local training constraints server-side
- rejected/invalid model output never mutates user data
- Coach never presents diagnosis as fact

## Hermes-originated writes

- Hermes uses the same domain validation as the web UI
- successful write creates an audit event
- UI may surface provenance (`Hermes`) where useful but does not treat it as lower-quality data
- duplicate idempotent retries do not create duplicate entries

## Feedback system

Use one shared toast/status system.

Semantic tones:

- success — saved/completed/linked
- info — neutral sync/context
- warning — recoverable caution
- danger — destructive or failed action

Critical errors also appear inline at the affected surface; toast is never the only copy of a corrective message.

## Loading and async resilience

- app shell remains stable during route/data loading
- keep previous non-dangerous content visible during background refresh where possible
- disable duplicate submit while a write is pending
- candidate/activity refreshes ignore stale responses
- Garmin sync failures do not block manual/FIT functionality

## Forms

- all inputs have real labels
- errors are text-associated with fields
- values survive failed submission
- numeric health/nutrition fields reject impossible parsing but do not invent medical limits
- textareas use `resize: none` and provide adequate height/auto-grow where needed
- token/secret fields are masked by default with accessible show/hide actions

## Accessibility

Target WCAG 2.2 AA.

- native semantic controls first
- visible keyboard focus
- logical heading structure
- no color-only status
- minimum 16px form text on narrow mobile layouts
- touch targets remain practical
- reduced motion respected
- completion and activity-link flows are keyboard operable
- progress text exposes current and target values to assistive technology

## Responsive behavior

Desktop Today uses Activity/Nutrition split. At narrower widths it becomes one vertical reading order without horizontal scrolling. Secondary metadata may collapse behind disclosure, but primary values/actions remain visible.

Tables/history views switch to purpose-built compact rows when a table would become unusable; do not squeeze desktop tables into tiny columns.

## Error shape

API/UI mapping uses stable backend errors:

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

UI copy translates technical codes into actionable plain language while retaining `requestId` for diagnostics when useful.
