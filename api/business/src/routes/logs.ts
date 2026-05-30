import { Hono } from 'hono'
import { db } from '../db'
import { sql } from 'drizzle-orm'

const logs = new Hono()

// GET /api/logs?limit=50 - 获取最近同步日志
logs.get('/', async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 200)
  try {
    const dbData = await db.execute(sql`
      SELECT id, task_type as "taskType", status, symbols_count as "symbolsCount",
             success_count as "successCount", failed_count as "failedCount",
             message, started_at as "startedAt", finished_at as "finishedAt"
      FROM sync_logs ORDER BY id DESC LIMIT ${limit}
    `)
    const rows = Array.isArray(dbData) ? dbData : (dbData as any).rows || []
    return c.json({ code: 0, msg: 'success', data: rows })
  } catch (e: any) {
    return c.json({ code: 50000, msg: e.message, data: null })
  }
})

export default logs
