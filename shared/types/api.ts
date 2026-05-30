// Unified API response wrapper
export interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T
}

// Paginated response
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

// Error code type — actual constants in backend lib/response.ts
export type ErrorCodeValue = number
