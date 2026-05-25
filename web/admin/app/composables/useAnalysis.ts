export function useAnalysis() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const triggerAnalysis = async (ticker: string, market = 'a_stock', depth = 'quick') => {
    const token = useCookie('token')
    return await $fetch<{ runId: number; status: string }>(`${baseUrl}/api/analysis/start`, {
      method: 'POST',
      body: { ticker, market, depth },
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  const getAnalysisHistory = async () => {
    const token = useCookie('token')
    return await $fetch(`${baseUrl}/api/analysis`, {
      headers: { Authorization: `Bearer ${token.value}` },
    })
  }

  return { triggerAnalysis, getAnalysisHistory }
}
