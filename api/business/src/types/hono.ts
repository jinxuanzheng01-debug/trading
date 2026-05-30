import type { Context } from 'hono'

export interface UserPayload {
  userId: number
  email: string
  username: string
  role: 'admin' | 'user'
}

// Stock quote response types
export interface StockQuoteResponse {
  itemId: number
  symbol: string
  quote: {
    symbol: string
    market: string
    name: string | null
    type: string | null
    exchange: string | null
    price: string | null
    open: string | null
    high: string | null
    low: string | null
    volume: number | null
    change: string | null
    change_percent: string | null
    prev_close: string | null
    timestamp: Date
    data_date: Date
    updated_at: Date
  } | null
}

// Reorder request type
export interface ReorderRequest {
  itemOrders: Array<{
    id: number
    sort_order: number
  }>
}

declare module 'hono' {
  interface ContextVariableMap {
    user: UserPayload
  }
}
