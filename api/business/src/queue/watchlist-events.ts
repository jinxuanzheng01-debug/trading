import { connection } from './index'

const STREAM = 'watchlist:events'

/** 发布自选股添加事件，由 scheduler 消费并同步历史K线 */
export async function publishWatchlistAdded(symbol: string) {
  await connection.xadd(STREAM, '*', 'type', 'added', 'symbol', symbol)
}

/** 发布自选股移除事件 */
export async function publishWatchlistRemoved(symbol: string) {
  await connection.xadd(STREAM, '*', 'type', 'removed', 'symbol', symbol)
}
