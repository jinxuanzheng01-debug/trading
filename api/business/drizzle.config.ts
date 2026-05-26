import type { Config } from 'drizzle-kit'

export default {
  schema: ['./src/db/schema.ts', './src/db/schema-stock.ts'],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://admin:admin123@localhost:5432/trading_agent',
  },
} satisfies Config
