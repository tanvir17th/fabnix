import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx src/seed/run-seed.ts',
  },
  datasource: {
    // `prisma generate` does not connect; a placeholder keeps it usable without .env.
    url: process.env.DATABASE_URL ?? 'postgresql://fabnix:fabnix@localhost:5432/fabnix',
  },
});
