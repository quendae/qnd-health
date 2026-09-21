import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'database/prisma/schema.prisma',
  migrations: {
    path: 'database/prisma/migrations',
  },
  datasource: {
    // prisma generate does not contact the DB, but Prisma 7 still loads this config.
    url: process.env.DATABASE_URL ?? 'postgresql://unused:unused@localhost:5432/unused',
  },
});
