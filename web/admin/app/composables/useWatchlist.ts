export interface WatchlistGroup {
  id: number
  userId: number
  name: string
  description?: string
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface WatchlistItem {
  id: number
  groupId: number
  symbol: string
  name?: string
  type: 'stock' | 'etf' | 'index' | 'crypto'
  exchange?: string
  notes?: string
  market?: string
  sortOrder?: number
  createdAt: string
  updatedAt: string
  quote?: StockQuote | null
}

export interface StockQuote {
  symbol: string
  market: string
  name: string | null
  type: string | null
  exchange: string | null
  interval: string
  open: string | null
  high: string | null
  low: string | null
  close: string | null
  volume: number | null
  change: string | null
  change_percent: string | null
  prev_close: string | null
  timestamp: string
  data_date: string
  updated_at: string
}

export interface KlineData {
  symbol: string
  interval: string
  data: Array<{
    symbol: string
    interval: string
    open: number
    high: number
    low: number
    close: number
    volume: number
    timestamp: string
  }>
}

export function useWatchlist() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  async function getGroups() {
    return await fetchWithAuth<WatchlistGroup[]>(
      `${config.public.apiBase}/api/watchlist/groups`,
    )
  }

  async function createGroup(data: { name: string; description?: string }) {
    return await fetchWithAuth<WatchlistGroup>(
      `${config.public.apiBase}/api/watchlist/groups`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async function updateGroup(id: number, data: { name?: string; description?: string }) {
    return await fetchWithAuth<WatchlistGroup>(
      `${config.public.apiBase}/api/watchlist/groups/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    )
  }

  async function deleteGroup(id: number) {
    return await fetchWithAuth<{ success: boolean }>(
      `${config.public.apiBase}/api/watchlist/groups/${id}`,
      {
        method: 'DELETE',
      },
    )
  }

  async function getItems(groupId: number) {
    return await fetchWithAuth<WatchlistItem[]>(
      `${config.public.apiBase}/api/watchlist/groups/${groupId}/items`,
    )
  }

  async function addItem(groupId: number, data: Partial<WatchlistItem>) {
    return await fetchWithAuth<WatchlistItem>(
      `${config.public.apiBase}/api/watchlist/groups/${groupId}/items`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async function updateItem(id: number, data: Partial<WatchlistItem>) {
    return await fetchWithAuth<WatchlistItem>(
      `${config.public.apiBase}/api/watchlist/items/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(data),
      },
    )
  }

  async function deleteItem(id: number) {
    return await fetchWithAuth<{ success: boolean }>(
      `${config.public.apiBase}/api/watchlist/items/${id}`,
      {
        method: 'DELETE',
      },
    )
  }

  // New quotes-related functions
  async function getQuotes(groupId: number) {
    return await fetchWithAuth<{ items: WatchlistItem[], quotes: StockQuote[] }>(
      `${config.public.apiBase}/api/watchlist-quotes/groups/${groupId}/quotes`,
    )
  }

  async function refreshQuotes(groupId: number) {
    return await fetchWithAuth<{ items: WatchlistItem[], quotes: StockQuote[] }>(
      `${config.public.apiBase}/api/watchlist-quotes/groups/${groupId}/refresh`,
      {
        method: 'POST',
      },
    )
  }

  async function reorderItems(groupId: number, itemOrders: Array<{ id: number, sort_order: number }>) {
    return await fetchWithAuth<WatchlistItem[]>(
      `${config.public.apiBase}/api/watchlist-quotes/groups/${groupId}/reorder`,
      {
        method: 'PUT',
        body: JSON.stringify({ itemOrders }),
      },
    )
  }

  async function getKlineData(itemId: number, interval: string = '1d', limit?: number) {
    const params = new URLSearchParams({ interval })
    if (limit) params.append('limit', limit.toString())
    return await fetchWithAuth<KlineData>(
      `${config.public.apiBase}/api/watchlist-quotes/items/${itemId}/kline?${params.toString()}`,
    )
  }

  return {
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    getItems,
    addItem,
    updateItem,
    deleteItem,
    getQuotes,
    refreshQuotes,
    reorderItems,
    getKlineData,
  }
}
