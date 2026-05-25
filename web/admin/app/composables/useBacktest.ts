export function useBacktest() {
  const config = useRuntimeConfig()
  const baseUrl = config.public.apiBase || ''

  const runBacktest = async (params: {
    strategyCode: string
    ticker: string
    startDate: string
    endDate: string
    initialCapital: number
    feeModel: string
  }) => {
    return await $fetch(`${baseUrl}/api/backtest/run`, {
      method: 'POST',
      body: params,
    })
  }

  return { runBacktest }
}
