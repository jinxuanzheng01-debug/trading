import { Context } from 'hono'

export interface UserPayload {
  userId: number
  email: string
  username: string
  role: 'admin' | 'user'
}

declare module 'hono' {
  interface ContextVariableMap {
    user: UserPayload
  }
}
