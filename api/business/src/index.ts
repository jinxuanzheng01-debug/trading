import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { auth as authRoutes } from './routes/auth'
import { watchlist as watchlistRoutes } from './routes/watchlist'
import { analysis as analysisRoutes } from './routes/analysis'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: ['http://localhost:3000'],
  credentials: true,
}))

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'trading-agent-api' }))

// Routes
app.route('/api/auth', authRoutes)
app.route('/api/watchlist', watchlistRoutes)
app.route('/api/analysis', analysisRoutes)

export { app }
export default app
