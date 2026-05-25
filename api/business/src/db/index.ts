import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL || 'postgresql://admin:admin123@localhost:5432/trading_agent'

const client = postgres(connectionString)
export const db = drizzle(client)
