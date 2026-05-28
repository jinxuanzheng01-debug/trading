import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'

import { auth as authRoutes } from './routes/auth'
import { watchlist as watchlistRoutes } from './routes/watchlist'
import { watchlistQuotes as watchlistQuotesRoutes } from './routes/watchlist-quotes'
import { analysis as analysisRoutes } from './routes/analysis'
import { internalQuotes as internalQuotesRoutes } from './routes/internal-quotes'
import stock from './routes/stock'
import { paper as paperRoutes } from './routes/paper'

const app = new Hono()

// Middleware
app.use('*', logger())
app.use('*', cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
}))

// Global error handler
app.onError((err, c) => {
  console.error(`[${c.req.method}] ${c.req.url}:`, err)
  return c.json({
    code: 50000,
    msg: process.env.NODE_ENV === 'production' ? '服务器内部错误' : err.message,
    data: null,
  }, 500)
})

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'trading-agent-api' }))

// Routes
app.route('/api/auth', authRoutes)
app.route('/api/watchlist', watchlistRoutes)
app.route('/api/watchlist-quotes', watchlistQuotesRoutes)
app.route('/api/analysis', analysisRoutes)
app.route('/api/internal', internalQuotesRoutes)
app.route('/api/stock', stock)
app.route('/api/paper', paperRoutes)

export { app }
export default app
