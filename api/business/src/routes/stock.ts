import { Hono } from 'hono'
import { db } from '../db'
import { stocks } from '../db/schema-stock'
import { eq } from 'drizzle-orm'
import { ok, fail } from '../lib/response'
import { getStockDetail, getKlinesByPeriod } from '../lib/market-data-client'
import type { StockDetailResponse } from '../types/stock'
import { KLINE_PERIODS } from '../types/stock'

const stock = new Hono()

/**
 * GET /api/stock/:symbol
 * 获取综合股票信息，包括报价、公司信息和指标
 */
stock.get('/:symbol', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()

  if (!symbol) {
    return fail(c, 40002, '股票代码不能为空')
  }

  try {
    // 检查股票是否存在于我们的数据库中
    const stockRecord = await db.query.stocks.findFirst({
      where: eq(stocks.symbol, symbol),
    })

    if (!stockRecord) {
      return fail(c, 40002, '未找到该股票代码')
    }

    // 从 market-data 服务获取
    const data = await getStockDetail(symbol)

    // 用数据库数据增强
    const response: StockDetailResponse = {
      info: {
        ...data.info,
        nameCn: stockRecord.name_cn || undefined,
      },
      quote: {
        ...data.quote,
        name: stockRecord.name_cn || stockRecord.name || data.quote.name,
      },
      metrics: data.metrics,
    }

    return ok(c, response)
  } catch (error) {
    console.error('Error fetching stock detail:', error)
    return fail(c, 50301, '行情服务暂时不可用')
  }
})

/**
 * GET /api/stock/:symbol/kline
 * 获取支持周期的K线数据
 */
stock.get('/:symbol/kline', async (c) => {
  const symbol = c.req.param('symbol')?.toUpperCase()

  if (!symbol) {
    return fail(c, 40002, '股票代码不能为空')
  }

  const query = c.req.query()
  const interval = (query.interval || '1d') as string
  const period = (query.period || '3M') as string

  // 验证周期
  if (!KLINE_PERIODS[period]) {
    return fail(c, 40001, `无效的时间范围: ${period}`)
  }

  try {
    const data = await getKlinesByPeriod(symbol, interval, period)
    return ok(c, { symbol, interval, period, data })
  } catch (error) {
    console.error('Error fetching kline data:', error)
    return fail(c, 50301, '行情服务暂时不可用')
  }
})

export default stock
