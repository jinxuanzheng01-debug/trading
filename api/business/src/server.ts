import { serve } from '@hono/node-server'
import app from './index'

const port = Number(process.env.PORT) || 4000

console.log(`Server starting on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port,
})

console.log(`Server running on http://localhost:${port}`)
