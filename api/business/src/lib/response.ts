import type { Context } from 'hono'

// 统一响应结构
export interface ApiResponse<T = any> {
  code: number
  msg: string
  data: T | null
}

// 错误码定义
export const ErrorCode = {
  SUCCESS: 0,
  // 通用错误
  BAD_REQUEST: 40000,
  UNAUTHORIZED: 40100,
  FORBIDDEN: 40300,
  NOT_FOUND: 40400,
  INTERNAL_ERROR: 50000,
  // 业务错误
  GROUP_NOT_FOUND: 40401,
  ITEM_NOT_FOUND: 40402,
  STOCK_ALREADY_EXISTS: 40001,
  STOCK_NOT_FOUND: 40002,
  REORDER_INVALID: 40003,
  // 服务错误
  MARKET_DATA_UNAVAILABLE: 50301,
} as const

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode]

// 错误码对应的默认消息
const ErrorMessages: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.BAD_REQUEST]: '请求参数错误',
  [ErrorCode.UNAUTHORIZED]: '未登录',
  [ErrorCode.FORBIDDEN]: '无权限',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.INTERNAL_ERROR]: '服务器内部错误',
  [ErrorCode.GROUP_NOT_FOUND]: '分组不存在',
  [ErrorCode.ITEM_NOT_FOUND]: '自选股不存在',
  [ErrorCode.STOCK_ALREADY_EXISTS]: '已存在该自选股',
  [ErrorCode.STOCK_NOT_FOUND]: '未找到该股票代码，请检查后重试',
  [ErrorCode.REORDER_INVALID]: '排序参数无效',
  [ErrorCode.MARKET_DATA_UNAVAILABLE]: '行情数据服务暂不可用',
}

/**
 * 成功响应
 */
export function ok<T>(c: Context, data: T, msg?: string): Response {
  const body: ApiResponse<T> = {
    code: ErrorCode.SUCCESS,
    msg: msg || 'success',
    data,
  }
  return c.json(body) as unknown as Response
}

/**
 * 失败响应
 */
export function fail(c: Context, code: ErrorCodeValue, msg?: string, data?: any): Response {
  const body: ApiResponse = {
    code,
    msg: msg || ErrorMessages[code] || '未知错误',
    data: data || null,
  }
  return c.json(body) as unknown as Response
}
