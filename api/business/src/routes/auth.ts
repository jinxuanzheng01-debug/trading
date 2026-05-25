import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db'
import { users } from '../db/schema'
import { hashPassword, verifyPassword } from '../lib/password'
import { signToken } from '../lib/jwt'
import { eq } from 'drizzle-orm'
import '../types/hono'

const auth = new Hono()

const registerSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(50),
  password: z.string().min(6),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

// POST /api/auth/register - Register new user
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const { email, username, password } = c.req.valid('json')

  // Check if user exists
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
  if (existing.length > 0) {
    return c.json({ error: 'Email already registered' }, 400)
  }

  const passwordHash = await hashPassword(password)

  const [newUser] = await db.insert(users).values({
    email,
    username,
    password: passwordHash,
    role: 'user',
  }).returning()

  const token = await signToken({
    userId: newUser.id,
    email: newUser.email,
    username: newUser.username,
    role: newUser.role as 'admin' | 'user',
  })

  return c.json({
    user: {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role as 'admin' | 'user',
    },
    token,
  })
})

// POST /api/auth/login - Login
auth.post('/login', zValidator('json', loginSchema), async (c) => {
  const { email, password } = c.req.valid('json')

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)

  if (!user || !(await verifyPassword(password, user.password))) {
    return c.json({ error: 'Invalid credentials' }, 401)
  }

  const token = await signToken({
    userId: user.id,
    email: user.email,
    username: user.username,
    role: user.role as 'admin' | 'user',
  })

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role as 'admin' | 'user',
    },
    token,
  })
})

export { auth }
