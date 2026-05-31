import { Worker } from 'bullmq'
import Redis from 'ioredis'

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
})

const BACKEND_URL = process.env.BACKEND_URL || 'http://api:4000'

export function startAnalysisWorker() {
  const worker = new Worker(
    'analysis',
    async (job) => {
      const { runId, ticker, market, depth } = job.data
      console.log(`Processing analysis ${runId}: ${ticker}`)

      try {
        const res = await fetch('http://localhost:3141/agents/quickAnalysisAgent/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: `分析 ${ticker}（市场：${market}），深度：${depth}` }],
          }),
        })

        if (!res.ok) {
          const errText = await res.text()
          throw new Error(`Agent call failed: ${res.status} ${errText}`)
        }

        const agentResult = await res.json()

        let analysisResult: Record<string, unknown>
        try {
          const text = agentResult.text || agentResult.content || JSON.stringify(agentResult)
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          analysisResult = jsonMatch ? JSON.parse(jsonMatch[0]) : { rawAnalysis: text }
        } catch {
          analysisResult = { rawAnalysis: JSON.stringify(agentResult) }
        }

        await fetch(`${BACKEND_URL}/api/analysis/${runId}/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ result: analysisResult }),
        })

        return { runId, status: 'completed' }
      } catch (err: any) {
        await fetch(`${BACKEND_URL}/api/analysis/${runId}/fail`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: err.message }),
        }).catch(() => {})

        throw err
      }
    },
    { connection, concurrency: 3 },
  )

  worker.on('completed', (job) => console.log(`Analysis ${job.data.runId} completed`))
  worker.on('failed', (job, err) => console.error(`Analysis ${job?.data.runId} failed:`, err.message))

  return worker
}
