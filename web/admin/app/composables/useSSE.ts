export function useAnalysisStream(runId: Ref<string | number>) {
  const status = ref<'connecting' | 'streaming' | 'completed' | 'failed'>('connecting')
  const data = ref<Record<string, any> | null>(null)
  const error = ref<string | null>(null)

  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  let timer: ReturnType<typeof setInterval> | null = null

  const connect = () => {
    status.value = 'connecting'
    const token = useCookie('token')

    timer = setInterval(async () => {
      try {
        const res = await $fetch<{ status: string; result: any; layerOutputs: any }>(
          `${baseUrl}/api/analysis/${runId.value}`,
          { headers: { Authorization: `Bearer ${token.value}` } },
        )

        data.value = res
        status.value = 'streaming'

        if (res.status === 'completed' || res.status === 'failed') {
          status.value = res.status as any
          if (timer) clearInterval(timer)
        }
      } catch (err: any) {
        error.value = err.message
        status.value = 'failed'
        if (timer) clearInterval(timer)
      }
    }, 2000)
  }

  const disconnect = () => {
    if (timer) clearInterval(timer)
    timer = null
  }

  onMounted(connect)
  onUnmounted(disconnect)

  watch(runId, () => {
    disconnect()
    connect()
  })

  return { status, data, error, connect, disconnect }
}
