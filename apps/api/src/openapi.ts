export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'QND Health API',
    version: '0.1.0',
    description: 'Private health, planning and nutrition API used by the QND Health web app and Hermes agent.',
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
      CompletedActivity: {
        type: 'object', required: ['id', 'provider', 'activityType', 'startedAt'],
        properties: {
          id: { type: 'string' }, provider: { type: 'string' }, activityType: { type: 'string' }, startedAt: { type: 'string', format: 'date-time' },
          durationSeconds: { type: ['integer', 'null'] }, distanceMeters: { type: ['number', 'null'] },
          avgHr: { type: ['integer', 'null'] }, maxHr: { type: ['integer', 'null'] }, calories: { type: ['number', 'null'] },
        },
      },
      TodayResponse: {
        type: 'object', required: ['date', 'activity', 'nutrition', 'weekToDate', 'remainingWeek'],
        properties: {
          date: { type: 'string', format: 'date' }, health: { type: ['object', 'null'], additionalProperties: true },
          latestMeasurement: { type: ['object', 'null'], additionalProperties: true }, activity: { type: 'object', additionalProperties: true },
          nutrition: { type: 'object', additionalProperties: true }, weekToDate: { type: 'object', additionalProperties: true },
          remainingWeek: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/api/v1/today': { get: { summary: 'Read the composed Today Hub model', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Today Hub data', content: { 'application/json': { schema: { $ref: '#/components/schemas/TodayResponse' } } } } } } },
    '/api/v1/activities': {
      get: {
        summary: 'List completed activities for a local calendar day', security: [{ bearerAuth: [] }],
        parameters: [{ name: 'date', in: 'query', required: true, schema: { type: 'string', format: 'date' } }],
        responses: { '200': { description: 'Completed activities', content: { 'application/json': { schema: { type: 'object', properties: { items: { type: 'array', items: { $ref: '#/components/schemas/CompletedActivity' } } } } } } }, '422': { description: 'Invalid date' } },
      },
    },
    '/api/v1/plans': {
      get: { summary: 'List plan items', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Plan item list' } } },
      post: { summary: 'Create a plan item', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Created plan item' } } },
    },
    '/api/v1/plans/{id}': {
      patch: {
        summary: 'Edit or move a plan item', security: [{ bearerAuth: [] }],
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
      post: { summary: 'Create a nutrition entry', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Created nutrition entry', content: { 'application/json': { schema: { $ref: '#/components/schemas/NutritionEntry' } } } }, '409': { description: 'Idempotency key conflict' } } },
    },
    '/api/v1/measurements': {
      post: { summary: 'Create a body measurement', security: [{ bearerAuth: [] }], parameters: [{ name: 'Idempotency-Key', in: 'header', required: false, schema: { type: 'string' } }], responses: { '201': { description: 'Created measurement' } } },
    },
  },
} as const;
