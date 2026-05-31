import { Hono } from 'hono'

const chanLLM = new Hono()

chanLLM.post('/llm', async (c) => {
  const body = await c.req.json<{ symbol: string; period?: string }>()
  const period = body.period || '1d'
  const periodLabel = period === '1w' ? '周线' : period === '1M' ? '月线' : '日线'

  const voltagentUrl = process.env.VOLTAGENT_URL || 'http://voltagent:3141'

  const resp = await fetch(`${voltagentUrl}/agents/chanAnalystAgent/text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: `请分析 ${body.symbol} 的${periodLabel}缠论结构，使用 get_chan_analysis 获取数据时 period 参数设为 ${period}。`,
    }),
  })

  if (!resp.ok) {
    const err = await resp.text()
    return c.json({ error: err }, 502)
  }

  const voltRes = await resp.json() as any
  const text: string = voltRes?.data?.text || voltRes?.text || ''

  // VoltAgent 返回的 text 中可能包含 JSON 代码块
  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
  if (jsonMatch) {
    try {
      return c.json(JSON.parse(jsonMatch[1]))
    } catch { /* fall through */ }
  }

  // 如果没有 JSON 代码块，尝试直接匹配 JSON
  const bareMatch = text.match(/\{[\s\S]*\}/)
  if (bareMatch) {
    try {
      return c.json(JSON.parse(bareMatch[0]))
    } catch { /* fall through */ }
  }

  return c.json({ raw: text })
})

export { chanLLM }
