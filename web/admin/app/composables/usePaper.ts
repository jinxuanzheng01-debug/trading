export interface PaperWallet {
  id: number
  userId: number
  name: string
  market: string
  currency: string
  initialBalance: string
  cash: number
  positionsValue?: number
  totalAssets?: number
  totalPnl?: number
  positionCount?: number
  createdAt: string
  updatedAt: string
}

export interface PaperPosition {
  id: number
  walletId: number
  stockCode: string
  stockName: string | null
  market: string
  quantity: number
  avgCost: number
  lastPrice: number
  marketValue: number
  unrealizedPnl: number
  unrealizedPnlPercent: number
  createdAt: string
  updatedAt: string
}

export interface PaperOrder {
  id: number
  walletId: number
  stockCode: string
  stockName: string | null
  side: 'buy' | 'sell'
  quantity: string
  price: string
  amount: string
  fee: string
  status: string
  filledAt: string
  createdAt: string
}

export interface PlaceOrderResult {
  order: PaperOrder
  position: PaperPosition | null
  wallet: PaperWallet
}

export function usePaper() {
  const config = useRuntimeConfig()
  const { fetchWithAuth } = useAuth()

  async function getWallets(): Promise<PaperWallet[]> {
    return await fetchWithAuth<PaperWallet[]>(
      `${config.public.apiBase}/api/paper/wallets`,
    )
  }

  async function createWallet(data: { name: string; market: string; initial_balance: number }): Promise<PaperWallet> {
    return await fetchWithAuth<PaperWallet>(
      `${config.public.apiBase}/api/paper/wallets`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async function deleteWallet(id: number): Promise<void> {
    await fetchWithAuth<{ success: boolean }>(
      `${config.public.apiBase}/api/paper/wallets/${id}`,
      { method: 'DELETE' },
    )
  }

  async function resetWallet(id: number): Promise<void> {
    await fetchWithAuth<{ message: string; cash: number }>(
      `${config.public.apiBase}/api/paper/wallets/${id}/reset`,
      { method: 'POST' },
    )
  }

  async function getPositions(walletId: number): Promise<PaperPosition[]> {
    return await fetchWithAuth<PaperPosition[]>(
      `${config.public.apiBase}/api/paper/wallets/${walletId}/positions`,
    )
  }

  async function addPosition(walletId: number, data: { stock_code: string; quantity: number; avg_cost: number }): Promise<PaperPosition> {
    return await fetchWithAuth<PaperPosition>(
      `${config.public.apiBase}/api/paper/wallets/${walletId}/positions`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async function placeOrder(walletId: number, data: { stock_code: string; side: 'buy' | 'sell'; quantity: number }): Promise<PlaceOrderResult> {
    return await fetchWithAuth<PlaceOrderResult>(
      `${config.public.apiBase}/api/paper/wallets/${walletId}/orders`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      },
    )
  }

  async function getOrders(walletId: number, limit: number = 50): Promise<PaperOrder[]> {
    return await fetchWithAuth<PaperOrder[]>(
      `${config.public.apiBase}/api/paper/wallets/${walletId}/orders?limit=${limit}`,
    )
  }

  return {
    getWallets,
    createWallet,
    deleteWallet,
    resetWallet,
    getPositions,
    addPosition,
    placeOrder,
    getOrders,
  }
}
