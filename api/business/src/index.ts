import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { auth as authRoutes } from './routes/auth'
import { watchlist as watchlistRoutes } from './routes/watchlist'
import { watchlistQuotes as watchlistQuotesRoutes } from './routes/watchlist-quotes'
import { analysis as analysisRoutes } from './routes/analysis'
import { internalQuotes as internalQuotesRoutes } from './routes/internal-quotes'
import stock from './routes/stock'

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
app.route('/api/watchlist-quotes', watchlistQuotesRoutes)
app.route('/api/analysis', analysisRoutes)
app.route('/api/internal', internalQuotesRoutes)
app.route('/api/stock', stock)

export { app }
export default app
