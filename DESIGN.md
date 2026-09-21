# QND Health — Visual Design System

## Product character

QND Health is a private daily health cockpit: calm, precise, information-dense enough to be useful, but never clinical or corporate. The visual language should feel closer to a well-designed training notebook and a good instrument panel than to a generic SaaS analytics dashboard.

The first screen is about **today**. History, charts, integrations and settings support that job rather than competing with it.

## Signature element

The signature is the **Day Spine**: a thin vertical timeline/rule running through the Activity and Nutrition regions. Entries align to the day rather than floating as unrelated cards. Completed items close visually against the spine; upcoming items remain open. On mobile the same spine becomes the primary rhythm for the whole Today page.

Do not turn the product into a bento grid.

## Color tokens

The palette is deliberately quiet with two domain accents.

- `--ink: #17211B` — primary text
- `--muted: #66716B` — secondary text
- `--canvas: #F7F8F5` — page background; cool neutral, not cream
- `--surface: #FFFFFF` — interactive/content surface
- `--line: #DCE2DD` — rules, separators, field borders
- `--activity: #187A55` — movement/training accent
- `--activity-soft: #E6F2EC`
- `--nutrition: #B9692E` — food/nutrition accent
- `--nutrition-soft: #F7EDE5`
- `--info: #386887`
- `--warning: #9A6A19`
- `--danger: #A6423B`
- `--success: #187A55`

Color never carries state alone. Pair state color with iconography and text.

## Typography

Prefer system-installable or web-safe stacks in the first release to keep self-hosting simple and prevent layout shifts.

- **Display / section headings:** `Aptos Display`, `Segoe UI Variable Display`, `Segoe UI`, sans-serif
- **Body / controls:** `Aptos`, `Segoe UI Variable Text`, `Segoe UI`, sans-serif
- **Data / compact numerics:** `IBM Plex Mono`, `Cascadia Mono`, `SFMono-Regular`, monospace

Use the mono role sparingly for measurements, dates, progress values and API-like data—not for ordinary prose.

### Type scale

- page date/title: `clamp(2rem, 4vw, 3.6rem)`, weight 620
- major value: `2rem`, weight 650
- section title: `1.05rem`, weight 650, tight tracking
- body: `1rem`, line-height 1.5
- utility label: `.78rem`, weight 650, letter-spacing `.04em`
- data caption: `.82rem`, mono

## Layout

### Desktop

- max readable app width: 1480px
- page gutters: 32–48px
- Today primary split: Activity `55%`, Nutrition `45%`
- health quick strip sits above the split and stays visually secondary
- week-to-date and remaining-week sections are horizontal rails below Today
- Coach appears after factual data, not before it

### Mobile

Order:

1. date/navigation
2. compact health strip
3. Activity
4. Nutrition
5. Week to date
6. Remaining week
7. Coach

Do not merely collapse desktop cards; reduce secondary metadata and keep completion controls thumb-reachable.

## Surfaces and geometry

- Default radius: 12px
- Small controls: 8px
- Do not wrap every region in a card.
- Use section rules, open whitespace and one-sided rails for hierarchy.
- Reserve bordered surfaces for interactive groups, editors and actionable candidate lists.
- Shadows are rare: only floating popovers/dialogs use them.
- App shell remains flat and stable.

## Activity visual language

- Activity accent appears on progress bars, completion marks and the Activity section spine.
- Metric goals display `current / target` prominently, e.g. `6 120 / 7 500 steps`.
- Count goals display explicit stepper/progress, e.g. `5 / 8 loops`.
- Activity-link items show one primary `Attach activity` action and ranked suggestions below it.
- Completed rows reduce contrast slightly but remain fully legible.

## Nutrition visual language

- Nutrition uses the warmer accent but shares typography and spacing with Activity.
- The top summary is calories + macros, not a decorative chart.
- Meal entries follow chronological order along the Day Spine.
- Source metadata (`Hermes`, manual) is quiet utility copy.

## Health quick strip

Show at most 4–6 high-value metrics in the first viewport depending on width, for example:

- weight
- resting HR
- sleep
- Body Battery / energy
- HRV
- steps if not already dominant in Activity

The strip must not look like six equal KPI cards. Use inline measurements separated by rules.

## Week sections

Week-to-date should emphasize completion and trajectory rather than many independent tiles. Remaining week is a compact agenda rail with day name, primary planned item(s), and status.

## Interaction and motion

- 140–180ms transitions for hover/selection.
- No ambient animations.
- Completion may use one restrained check transition.
- `prefers-reduced-motion` removes non-essential transitions.
- Visible `:focus-visible` ring uses `--info` with enough contrast.

## Iconography

Use a consistent thin-to-medium outline icon set. Icons clarify actions/status but do not decorate headings. Completion states require a check / partial / skipped symbol plus text where ambiguity is possible.

## Charts

Charts are secondary history/progress surfaces, never the hero of Today.

- thin axes/rules
- no gradient area fills by default
- comparison lines use activity/nutrition/info semantic colors
- tooltips show exact value/date
- charts remain understandable at 200% zoom and keyboard-accessible where interactive

## What NOT to do

- No purple/blue SaaS gradient.
- No glassmorphism.
- No giant rounded bento-card dashboard.
- No decorative health-score rings everywhere.
- No gamified confetti/streak pressure.
- No equal visual weight for every Garmin metric.
- No medical-red alarm styling for ordinary training deviations.
- No invented AI certainty or diagnostic language.
