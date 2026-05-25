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
  createdAt: string
  updatedAt: string
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

  return {
    getGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    getItems,
    addItem,
    updateItem,
    deleteItem,
  }
}
