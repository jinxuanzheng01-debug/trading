export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const path = event.path

  let target: string
  let targetPath = path

  if (path.startsWith('/api/agent')) {
    target = config.agentInternal || 'http://voltagent:4001'
    targetPath = path.replace('/api/agent', '')
  } else if (path.startsWith('/api/backtest')) {
    target = config.backtestInternal || 'http://backtest:8002'
    targetPath = path.replace('/api/backtest', '/api')
  } else {
    target = config.apiBaseInternal || 'http://api:4000'
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined

    const response = await fetch(target + targetPath, {
      method: event.method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: event.headers.get('Authorization') || '',
      },
      body,
    })

    const data = await response.json()
    setResponseStatus(event, response.status)
    return data
  } catch (err: any) {
    setResponseStatus(event, 502)
    return { success: false, error: err.message || 'Proxy error' }
  }
})
