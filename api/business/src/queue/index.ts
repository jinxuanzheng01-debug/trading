import { Queue } from 'bullmq'
import Redis from 'ioredis'

export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

export const analysisQueue = new Queue('analysis', { connection })
export const backtestQueue = new Queue('backtest', { connection })
