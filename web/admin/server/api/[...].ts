export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const path = event.path

  let target: string
  let targetPath = path

  if (path.startsWith('/api/agent')) {
    target = config.agentInternal || 'http://voltagent:3141'
    targetPath = path.replace('/api/agent', '')
  } else if (path.startsWith('/api/backtest')) {
    target = config.backtestInternal || 'http://backtest:8002'
    targetPath = path.replace('/api/backtest', '/api')
  } else if (path.startsWith('/api/ta')) {
    target = config.taEngineInternal || 'http://ta-engine:8003'
    targetPath = path.replace('/api/ta', '/api')
  } else {
    target = config.apiBaseInternal || 'http://api:4000'
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined

    const timeout = path.startsWith('/api/chan/llm') ? 120000 : 30000
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const response = await fetch(target + targetPath, {
      signal: controller.signal,
      method: event.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: event.headers.get('Authorization') || '',
      },
      body,
    })

    const data = await response.json()
    clearTimeout(timer)
    setResponseStatus(event, response.status)
    return data
  } catch (err: any) {
    clearTimeout(timer)
    setResponseStatus(event, 502)
    return { success: false, error: err.message || 'Proxy error' }
  }
})
