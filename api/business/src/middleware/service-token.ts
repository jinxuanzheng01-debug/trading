import type { MiddlewareHandler } from 'hono'

const SERVICE_TOKEN = process.env.SERVICE_TOKEN || 'trading-agent-internal-token'

export const serviceTokenAuth: MiddlewareHandler = async (c, next) => {
  const token = c.req.header('X-Service-Token')

  if (!token || token !== SERVICE_TOKEN) {
    return c.json({ code: 40300, msg: 'Forbidden', data: null }, 403)
  }

  await next()
}
