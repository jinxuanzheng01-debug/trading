import { MiddlewareHandler } from 'hono'
import { verifyToken } from '../lib/jwt'
import type { UserPayload } from '../types/hono'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const authHeader = c.req.header('Authorization')

  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const token = authHeader.substring(7)
  const payload = await verifyToken(token)

  if (!payload) {
    return c.json({ error: 'Invalid token' }, 401)
  }

  c.set('user', payload)
  await next()
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const user = c.get('user')

  if (user?.role !== 'admin') {
    return c.json({ error: 'Forbidden' }, 403)
  }

  await next()
}
