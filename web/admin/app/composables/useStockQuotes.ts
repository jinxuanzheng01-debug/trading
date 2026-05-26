export interface StockQuote {
  symbol: string
  name: string
  type: string
  exchange: string
  price: number
  change: number
  changePercent: number
  volume: number
  marketCap: number
  prevClose: number
  dataDate: string
}

export interface KlineData {
  symbol: string
  interval: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  timestamp: string
  dataDate: string
}

import { ref, readonly } from 'vue'

export function useStockQuotes() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  const quotes = ref<Record<string, StockQuote>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)

  /**
   * Get quotes for a group's items
   * Uses the backend API which handles caching and market-data service calls
   */
  async function getGroupQuotes(groupId: number, interval: string = '1d') {
    loading.value = true
    error.value = null

    try {
      const response = await fetchWithAuth<{ quotes: StockQuote[] }>(
        `${config.public.apiBase}/api/watchlist-quotes/groups/${groupId}/quotes?interval=${interval}`,
      )

      if (response && response.quotes) {
        quotes.value = response.quotes.reduce((acc, quote) => {
          acc[quote.symbol] = quote
          return acc
        }, {} as Record<string, StockQuote>)
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch quotes'
      console.error('Failed to fetch group quotes:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * Refresh quotes for a group
   */
  async function refreshGroup(groupId: number, interval: string = '1d') {
    loading.value = true
    error.value = null

    try {
      await fetchWithAuth<{ success: boolean; updated: number; failed: number }>(
        `${config.public.apiBase}/api/watchlist-quotes/groups/${groupId}/refresh?interval=${interval}`,
        {
          method: 'POST',
        }
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to refresh group'
      console.error('Failed to refresh group:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Reorder items in a group
   */
  async function reorderItems(groupId: number, itemIds: number[]) {
    // TODO: Implement reorder items functionality
    // The endpoint doesn't exist yet, so we'll implement it later
    loading.value = true
    error.value = null

    try {
      // This would call the business API to reorder items
      // The endpoint doesn't exist yet, so we'll implement it later
      await fetchWithAuth(
        `${config.public.apiBase}/api/watchlist/groups/${groupId}/reorder`,
        {
          method: 'PUT',
          body: JSON.stringify({ itemIds }),
        },
      )
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to reorder items'
      console.error('Failed to reorder items:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Get K-line data for a specific item
   * Uses the backend API which handles caching and market-data service calls
   */
  async function getItemKline(itemId: number, interval: string = '1d', limit?: number): Promise<KlineData[]> {
    loading.value = true
    error.value = null

    try {
      const params = new URLSearchParams()
      params.set('interval', interval)
      if (limit) {
        params.set('limit', limit.toString())
      }

      const response = await fetchWithAuth<{ data: KlineData[] }>(
        `${config.public.apiBase}/api/watchlist-quotes/items/${itemId}/kline?${params}`,
      )

      return response?.data || []
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to fetch kline data'
      console.error('Failed to fetch kline data:', e)
      return []
    } finally {
      loading.value = false
    }
  }

  return {
    quotes: readonly(quotes),
    loading: readonly(loading),
    error: readonly(error),
    getGroupQuotes,
    refreshGroup,
    reorderItems,
    getItemKline,
  }
}
