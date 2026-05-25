export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const target = config.apiBaseInternal || 'http://api:4000'

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(event.method)
      ? await readRawBody(event)
      : undefined

    const response = await fetch(target + event.path, {
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
