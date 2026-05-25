import { Hono } from 'hono'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db'
import { analysisRuns } from '../db/schema'
import { analysisQueue } from '../queue'
import type { AnalysisJobData } from '../queue/analysis'

const analysis = new Hono()

// 触发分析
analysis.post('/start', async (c) => {
  const user = c.get('user') as unknown as { id: number }
  const body = await c.req.json<{ ticker: string; market: string; depth: string }>()

  const [run] = await db.insert(analysisRuns).values({
    userId: user.id,
    ticker: body.ticker,
    market: body.market || 'a_stock',
    depth: body.depth || 'quick',
    status: 'pending',
  }).returning()

  const jobData: AnalysisJobData = {
    runId: String(run.id),
    userId: user.id,
    ticker: body.ticker,
    market: (body.market || 'a_stock') as AnalysisJobData['market'],
    depth: (body.depth || 'quick') as AnalysisJobData['depth'],
  }
  await analysisQueue.add('analyze', jobData, {
    attempts: 2,
    backoff: { type: 'exponential', delay: 5000 },
  })

  return c.json({ runId: run.id, status: 'pending' })
})

// 查询分析状态
analysis.get('/:id', async (c) => {
  const user = c.get('user') as unknown as { id: number }
  const id = Number(c.req.param('id'))

  const rows = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.id, id))
    .limit(1)

  if (!rows.length || rows[0].userId !== user.id) {
    return c.json({ error: 'Not found' }, 404)
  }

  const run = rows[0]
  return c.json({
    ...run,
    result: run.result ? JSON.parse(run.result) : null,
    layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
  })
})

// 分析完成回调
analysis.post('/:id/complete', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  await db.update(analysisRuns)
    .set({
      status: 'completed',
      result: JSON.stringify(body.result),
      layerOutputs: JSON.stringify(body.layerOutputs || {}),
      completedAt: new Date(),
    })
    .where(eq(analysisRuns.id, id))

  return c.json({ success: true })
})

// 分析失败回调
analysis.post('/:id/fail', async (c) => {
  const id = Number(c.req.param('id'))
  const body = await c.req.json()

  await db.update(analysisRuns)
    .set({
      status: 'failed',
      result: JSON.stringify({ error: body.error }),
      completedAt: new Date(),
    })
    .where(eq(analysisRuns.id, id))

  return c.json({ success: true })
})

// SSE 流式端点
analysis.get('/:id/stream', async (c) => {
  const id = c.req.param('id')

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let done = false

      const poll = async () => {
        if (done) return

        const rows = await db.select().from(analysisRuns)
          .where(eq(analysisRuns.id, Number(id)))
          .limit(1)

        if (rows.length) {
          const run = rows[0]
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            status: run.status,
            result: run.result ? JSON.parse(run.result) : null,
            layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
          })}\n\n`))

          if (run.status === 'completed' || run.status === 'failed') {
            done = true
            controller.close()
            return
          }
        }

        if (!done) {
          setTimeout(poll, 2000)
        }
      }

      poll()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// 分析历史
analysis.get('/', async (c) => {
  const user = c.get('user') as unknown as { id: number }

  const runs = await db.select().from(analysisRuns)
    .where(eq(analysisRuns.userId, user.id))
    .orderBy(desc(analysisRuns.createdAt))
    .limit(50)

  return c.json(runs.map(run => ({
    ...run,
    result: run.result ? JSON.parse(run.result) : null,
    layerOutputs: run.layerOutputs ? JSON.parse(run.layerOutputs) : null,
  })))
})

export { analysis }
