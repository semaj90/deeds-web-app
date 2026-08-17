import * as dotenv from 'dotenv';
import type { Config } from 'drizzle-kit';

dotenv.config({ path: './.env' });

export default {
  schema: [
    './src/lib/server/db/unified-schema.ts',
    './src/lib/server/db/atlas-control-schema.ts',
    './src/lib/server/db/atlas-lease-schema.ts',
    './src/lib/server/db/atlas-runtime-schema.ts',
    './src/lib/server/db/atlas-workflow-schema.ts',
    './src/lib/server/database/vector-schema-simple.ts'
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/prosecutor_db'
  },
  verbose: true,
  strict: true
} satisfies Config;
