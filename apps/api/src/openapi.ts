export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'QND Health API',
    version: '0.3.0',
    description: 'Private health, planning, nutrition, profile and coaching API used by the QND Health web app and Hermes agent.',
  },
  servers: [{ url: 'https://fit.qqnd.fyi', description: 'QND Health production' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'QND Health API token' } },
    schemas: {
      NutritionEntry: {
        type: 'object', required: ['id', 'consumedAt', 'mealType', 'title', 'source'],
        properties: {
          id: { type: 'string' }, consumedAt: { type: 'string', format: 'date-time' }, mealType: { type: 'string' }, title: { type: 'string' },
          caloriesKcal: { type: ['number', 'null'] }, proteinGrams: { type: ['number', 'null'] }, carbsGrams: { type: ['number', 'null'] },
          fatGrams: { type: ['number', 'null'] }, fiberGrams: { type: ['number', 'null'] }, quantityText: { type: ['string', 'null'] },
          notes: { type: ['string', 'null'] }, source: { type: 'string' },
        },
      },
      NutritionWrite: {
        type: 'object',
        properties: {
          consumedAt: { type: 'string', format: 'date-time' }, mealType: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'snack', 'other'] },
          title: { type: 'string' }, caloriesKcal: { type: ['number', 'null'], minimum: 0 }, proteinGrams: { type: ['number', 'null'], minimum: 0 },
          carbsGrams: { type: ['number', 'null'], minimum: 0 }, fatGrams: { type: ['number', 'null'], minimum: 0 }, fiberGrams: { type: ['number', 'null'], minimum: 0 },
          quantityText: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] }, source: { type: 'string', enum: ['hermes', 'manual'] },
        },
      },
      HealthProfile: {
        type: 'object', required: ['id', 'dateOfBirth', 'sexForBmr', 'heightCm', 'activityFactor', 'defaultStepsGoal', 'dailyCaloriesGoalKcal', 'dailyProteinGoalGrams'],
        properties: {
          id: { type: 'string', enum: ['default'] },
          dateOfBirth: { type: ['string', 'null'], format: 'date' },
          sexForBmr: { type: ['string', 'null'], enum: ['male', 'female', null] },
          heightCm: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 260 },
          activityFactor: { type: 'number', minimum: 1, maximum: 3 },
          defaultStepsGoal: { type: 'integer', minimum: 1, maximum: 100000 },
          dailyCaloriesGoalKcal: { type: ['integer', 'null'], minimum: 1, maximum: 20000, description: 'Optional manually configured daily calorie target. It is distinct from estimated TDEE.' },
          dailyProteinGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 1000, description: 'Optional manually configured daily protein target in grams.' },
        },
      },
      HealthProfilePatch: {
        type: 'object', minProperties: 1,
        properties: {
          dateOfBirth: { type: ['string', 'null'], format: 'date' },
          sexForBmr: { type: ['string', 'null'], enum: ['male', 'female', null] },
          heightCm: { type: ['number', 'null'], exclusiveMinimum: 0, maximum: 260 },
          activityFactor: { type: 'number', minimum: 1, maximum: 3 },
          defaultStepsGoal: { type: 'integer', minimum: 1, maximum: 100000 },
          dailyCaloriesGoalKcal: { type: ['integer', 'null'], minimum: 1, maximum: 20000, description: 'Set null to disable calorie-goal tracking.' },
          dailyProteinGoalGrams: { type: ['integer', 'null'], minimum: 1, maximum: 1000, description: 'Set null to disable protein-goal tracking.' },
        },
      },
      EnergyEstimate: {
        type: 'object', required: ['bmrKcal', 'tdeeKcal', 'source', 'activityFactor'],
        properties: {
          bmrKcal: { type: 'number', description: 'Estimated basal metabolic rate in kcal/day.' },
          tdeeKcal: { type: 'number', description: 'Phase-one estimated total daily energy expenditure in kcal/day.' },
          source: { type: 'string', enum: ['mifflin_st_jeor'] },
          activityFactor: { type: 'number', minimum: 1, maximum: 3 },
        },
      },
      CompletedActivity: {
        type: 'object', required: ['id', 'provider', 'activityType', 'startedAt'],
        properties: {
          id: { type: 'string' }, provider: { type: 'string' }, providerActivityId: { type: ['string', 'null'] }, transport: { type: ['string', 'null'] },
          activityType: { type: 'string' }, startedAt: { type: 'string', format: 'date-time' },
          durationSeconds: { type: ['integer', 'null'] }, distanceMeters: { type: ['number', 'null'] }, avgHr: { type: ['integer', 'null'] },
          maxHr: { type: ['integer', 'null'] }, avgPaceSecondsPerKm: { type: ['integer', 'null'] }, cadence: { type: ['number', 'null'] },
          elevationGainMeters: { type: ['number', 'null'] }, calories: { type: ['number', 'null'] },
        },
      },
      DailyHealthIngest: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: ['garmin'], default: 'garmin' },
          transport: { type: 'string', enum: ['home_assistant', 'garmin_api'] },
          steps: { type: ['integer', 'null'], minimum: 0 }, stepsGoal: { type: ['number', 'null'], minimum: 0 },
          floorsAscended: { type: ['number', 'null'], minimum: 0 }, floorsDescended: { type: ['number', 'null'], minimum: 0 },
          vo2Max: { type: ['number', 'null'], minimum: 0 }, providerBmrKcal: { type: ['number', 'null'], minimum: 0 },
          intensityMinutes: { type: ['integer', 'null'], minimum: 0 }, restingHr: { type: ['integer', 'null'], minimum: 0 },
          hrv: { type: ['number', 'null'], minimum: 0 }, stress: { type: ['number', 'null'], minimum: 0 },
          bodyBattery: { type: ['number', 'null'], minimum: 0 }, sleepDurationSeconds: { type: ['integer', 'null'], minimum: 0 },
          sleepStages: { type: ['object', 'null'], additionalProperties: true }, respiration: { type: ['number', 'null'], minimum: 0 },
          spo2: { type: ['number', 'null'], minimum: 0 }, calories: { type: ['number', 'null'], minimum: 0 },
          activeCalories: { type: ['number', 'null'], minimum: 0 }, hydrationMl: { type: ['number', 'null'], minimum: 0 },
          readiness: { type: ['object', 'null'], additionalProperties: true },
        },
      },
      ActivityImport: {
        type: 'object', required: ['activityType', 'startedAt'],
        properties: {
          transport: { type: 'string', enum: ['home_assistant', 'garmin_api', 'file_import'] },
          activityType: { type: 'string' }, startedAt: { type: 'string', format: 'date-time' },
          durationSeconds: { type: ['integer', 'null'], minimum: 0 }, distanceMeters: { type: ['number', 'null'], minimum: 0 },
          avgHr: { type: ['integer', 'null'], minimum: 0 }, maxHr: { type: ['integer', 'null'], minimum: 0 },
          avgPaceSecondsPerKm: { type: ['integer', 'null'], minimum: 0 }, cadence: { type: ['number', 'null'], minimum: 0 },
          elevationGainMeters: { type: ['number', 'null'], minimum: 0 }, calories: { type: ['number', 'null'], minimum: 0 },
        },
      },
      BodyMeasurementInput: {
        type: 'object', required: ['measuredAt', 'weightKg'],
        properties: {
          measuredAt: { type: 'string', format: 'date-time' }, source: { type: 'string', enum: ['garmin', 'hermes', 'manual'] },
          transport: { type: ['string', 'null'], enum: ['home_assistant', 'garmin_api', null] }, weightKg: { type: 'number', exclusiveMinimum: 0 },
          bodyFatPercent: { type: ['number', 'null'], minimum: 0 }, bmi: { type: ['number', 'null'], minimum: 0 },
          muscleMassKg: { type: ['number', 'null'], minimum: 0 }, bodyWaterPercent: { type: ['number', 'null'], minimum: 0 },
          boneMassKg: { type: ['number', 'null'], minimum: 0 }, visceralFat: { type: ['number', 'null'], minimum: 0 },
          metabolicAge: { type: ['number', 'null'], minimum: 0 }, physiqueRating: { type: ['number', 'null'], minimum: 0 },
        },
      },
      TodayResponse: {
        type: 'object', required: ['date', 'activity', 'nutrition', 'weekToDate', 'remainingWeek', 'energy'],
        properties: {
          date: { type: 'string', format: 'date' }, health: { type: ['object', 'null'], additionalProperties: true },
          latestMeasurement: { type: ['object', 'null'], additionalProperties: true },
          energy: { oneOf: [{ $ref: '#/components/schemas/EnergyEstimate' }, { type: 'null' }] },
          activity: { type: 'object', additionalProperties: true }, nutrition: { type: 'object', additionalProperties: true },
          weekToDate: { type: 'object', additionalProperties: true }, remainingWeek: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      HistoryResponse: {
        type: 'object', required: ['from', 'to', 'days'],
        properties: {
          from: { type: 'string', format: 'date' }, to: { type: 'string', format: 'date' },
          days: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
      ProgressResponse: {
        type: 'object', required: ['period', 'plan', 'activity', 'averages', 'weight', 'series'],
        properties: {
          period: { type: 'object', additionalProperties: true }, plan: { type: 'object', additionalProperties: true },
          activity: { type: 'object', additionalProperties: true }, averages: { type: 'object', additionalProperties: true },
          weight: { type: 'object', additionalProperties: true }, series: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/v1/today': { get: { summary: 'Read the composed Today Hub model', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Today Hub data', content: { 'application/json': { schema: { $ref: '#/components/schemas/TodayResponse' } } } } } } },
    '/api/v1/profile': {
      get: {
        summary: 'Read the single-user health profile used for step goals and energy estimates', security: [{ bearerAuth: [] }],
        responses: {
          '200': { description: 'Health profile or null before first save', content: { 'application/json': { schema: { oneOf: [{ $ref: '#/components/schemas/HealthProfile' }, { type: 'null' }] } } } },
        },
      },
      patch: {
        summary: 'Update the single-user health profile', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthProfilePatch' } } } },
        responses: {
          '200': { description: 'Updated health profile', content: { 'application/json': { schema: { $ref: '#/components/schemas/HealthProfile' } } } },
          '422': { description: 'Invalid profile fields or future date of birth' },
        },
      },
    },
    '/api/v1/history': {
      get: {
        summary: 'Read consecutive daily health, activity, plan and weight history', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Every calendar day in the requested range; days with no measurements are returned with null/empty values', content: { 'application/json': { schema: { $ref: '#/components/schemas/HistoryResponse' } } } }, '422': { description: 'Invalid date range' } },
      },
    },
    '/api/v1/progress': {
      get: {
        summary: 'Read aggregate progress and trend series for a period', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', required: true, schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Progress aggregate and time series; series includes step goals, calories/goal, protein/goal and VO2 max when available; missing measurements remain null', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProgressResponse' } } } }, '422': { description: 'Invalid date range' } },
      },
    },
    '/api/v1/health/daily/{date}': {
      put: {
        summary: 'Upsert a Garmin daily-health snapshot, including Home Assistant transported data', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'date', in: 'path', required: true, schema: { type: 'string', format: 'date' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/DailyHealthIngest' } } } },
        responses: { '200': { description: 'Daily health snapshot created or updated' }, '422': { description: 'Invalid daily-health payload' } },
      },
    },
    '/api/v1/activities': {
      get: {
        summary: 'List imported completed activities for a local calendar day', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } }],
        responses: { '200': { description: 'Completed activities from Garmin/FIT/manual providers already stored in QND Health', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/CompletedActivity' } } } } } } }, '422': { description: 'Invalid date' } },
      },
    },
    '/api/v1/activities/{provider}/{providerActivityId}': {
      put: {
        summary: 'Idempotently import or update a provider activity', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'provider', in: 'path', required: true, schema: { type: 'string', enum: ['garmin', 'fit'] } },
          { name: 'providerActivityId', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ActivityImport' } } } },
        responses: { '200': { description: 'Activity created or updated', content: { 'application/json': { schema: { $ref: '#/components/schemas/CompletedActivity' } } } }, '422': { description: 'Invalid activity payload' } },
      },
    },
    '/api/v1/plans': {
      get: { summary: 'List plan items', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Plan item list' } } },
      post: { summary: 'Create a plan item; workout items may include structured sets/reps/time/rest metadata', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Created plan item' } } },
    },
    '/api/v1/plans/{id}': {
      patch: {
        summary: 'Edit or move a plan item, including workout structure', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        responses: { '200': { description: 'Updated plan item' }, '404': { description: 'Plan item not found' }, '422': { description: 'Invalid plan update' } },
      },
      delete: {
        summary: 'Delete a plan item', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        responses: { '204': { description: 'Plan item deleted' }, '404': { description: 'Plan item not found' } },
      },
    },
    '/api/v1/plans/{id}/activity': {
      post: {
        summary: 'Attach a completed Garmin/FIT activity to an activity-link plan', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        responses: { '200': { description: 'Activity attached' }, '404': { description: 'Plan or activity not found' }, '422': { description: 'Plan does not use activity_link' } },
      },
      delete: {
        summary: 'Detach the completed activity from a plan', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }, { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        responses: { '200': { description: 'Activity detached' } },
      },
    },
    '/api/v1/nutrition': {
      post: {
        summary: 'Create a nutrition entry', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NutritionWrite' } } } },
        responses: { '201': { description: 'Created nutrition entry', content: { 'application/json': { schema: { $ref: '#/components/schemas/NutritionEntry' } } } }, '409': { description: 'Idempotency key conflict' } },
      },
    },
    '/api/v1/nutrition/{id}': {
      patch: {
        summary: 'Edit a nutrition entry', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NutritionWrite' } } } },
        responses: {
          '200': { description: 'Updated nutrition entry', content: { 'application/json': { schema: { $ref: '#/components/schemas/NutritionEntry' } } } },
          '404': { description: 'Nutrition entry not found' }, '422': { description: 'Invalid nutrition update' },
        },
      },
      delete: {
        summary: 'Delete a nutrition entry', security: [{ bearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } },
        ],
        responses: { '204': { description: 'Nutrition entry deleted' }, '404': { description: 'Nutrition entry not found' } },
      },
    },
    '/api/v1/measurements': {
      post: {
        summary: 'Create a body measurement, optionally preserving Garmin/Home Assistant provenance', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/BodyMeasurementInput' } } } },
        responses: { '201': { description: 'Created measurement' } },
      },
    },
  },
} as const;
