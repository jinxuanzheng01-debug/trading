<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PaperWallet, PaperPosition, PaperOrder } from '~/composables/usePaper'

definePageMeta({
  middleware: 'auth',
})

const route = useRoute()
const walletId = computed(() => Number(route.params.id))

const paper = usePaper()

const wallets = ref<PaperWallet[]>([])
const positions = ref<PaperPosition[]>([])
const orders = ref<PaperOrder[]>([])

const isLoading = ref(false)
const isPlacingOrder = ref(false)
const isAddingPosition = ref(false)
const isResetting = ref(false)

const showOrderDialog = ref(false)
const showAddPositionDialog = ref(false)
const showResetDialog = ref(false)

const orderForm = reactive({
  stock_code: '',
  side: 'buy' as 'buy' | 'sell',
  quantity: 0,
})

const addPositionForm = reactive({
  stock_code: '',
  quantity: 0,
  avg_cost: 0,
})

const marketConfig: Record<string, { flag: string; label: string; currency: string; symbol: string }> = {
  CN: { flag: '🇨🇳', label: 'A股', currency: 'CNY', symbol: '¥' },
  HK: { flag: '🇭🇰', label: '港股', currency: 'HKD', symbol: 'HK$' },
  US: { flag: '🇺🇸', label: '美股', currency: 'USD', symbol: '$' },
}

const wallet = computed(() => wallets.value.find(w => w.id === walletId.value))

const marketInfo = computed(() => {
  if (!wallet.value) return { flag: '', label: '', currency: '', symbol: '' }
  return marketConfig[wallet.value.market] || { flag: '🌐', label: wallet.value.market, currency: wallet.value.currency, symbol: '$' }
})

const currencySymbol = computed(() => {
  if (!wallet.value) return '$'
  if (wallet.value.currency === 'CNY') return '¥'
  if (wallet.value.currency === 'HKD') return 'HK$'
  if (wallet.value.currency === 'USD') return '$'
  return wallet.value.currency
})

const positionsValue = computed(() =>
  positions.value.reduce((sum, p) => sum + p.marketValue, 0),
)

const totalPnl = computed(() =>
  positions.value.reduce((sum, p) => sum + p.unrealizedPnl, 0),
)

const totalPnlPercent = computed(() => {
  if (!wallet.value) return 0
  const initial = Number(wallet.value.initialBalance)
  if (initial === 0) return 0
  return (totalPnl.value / initial) * 100
})

function formatAmount(num: number): string {
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + '万'
  return num.toFixed(2)
}

function openOrderDialog(side: 'buy' | 'sell', stockCode?: string) {
  orderForm.side = side
  orderForm.stock_code = stockCode || ''
  orderForm.quantity = 0
  showOrderDialog.value = true
}

function openAddPositionDialog() {
  addPositionForm.stock_code = ''
  addPositionForm.quantity = 0
  addPositionForm.avg_cost = 0
  showAddPositionDialog.value = true
}

async function loadData() {
  isLoading.value = true
  try {
    const [walletsData, positionsData, ordersData] = await Promise.all([
      paper.getWallets(),
      paper.getPositions(walletId.value),
      paper.getOrders(walletId.value),
    ])
    wallets.value = walletsData
    positions.value = positionsData
    orders.value = ordersData
  }
  catch (error: any) {
    toast.error(error.message || '加载失败')
  }
  finally {
    isLoading.value = false
  }
}

async function handlePlaceOrder() {
  if (!orderForm.stock_code.trim() || orderForm.quantity <= 0 || isPlacingOrder.value) return
  isPlacingOrder.value = true
  try {
    await paper.placeOrder(walletId.value, {
      stock_code: orderForm.stock_code,
      side: orderForm.side,
      quantity: orderForm.quantity,
    })
    await loadData()
    showOrderDialog.value = false
    toast.success('下单成功')
  }
  catch (error: any) {
    toast.error(error.message || '下单失败')
  }
  finally {
    isPlacingOrder.value = false
  }
}

async function handleAddPosition() {
  if (!addPositionForm.stock_code.trim() || addPositionForm.quantity <= 0 || addPositionForm.avg_cost <= 0 || isAddingPosition.value) return
  isAddingPosition.value = true
  try {
    await paper.addPosition(walletId.value, {
      stock_code: addPositionForm.stock_code,
      quantity: addPositionForm.quantity,
      avg_cost: addPositionForm.avg_cost,
    })
    await loadData()
    showAddPositionDialog.value = false
    toast.success('持仓录入成功')
  }
  catch (error: any) {
    toast.error(error.message || '录入失败')
  }
  finally {
    isAddingPosition.value = false
  }
}

async function handleReset() {
  if (isResetting.value) return
  isResetting.value = true
  try {
    await paper.resetWallet(walletId.value)
    await loadData()
    showResetDialog.value = false
    toast.success('钱包已重置')
  }
  catch (error: any) {
    toast.error(error.message || '重置失败')
  }
  finally {
    isResetting.value = false
  }
}

onMounted(() => {
  loadData()
})
</script>

<template>
  <div class="w-full flex flex-col gap-4">
    <!-- Loading -->
    <div v-if="isLoading && !wallet" class="flex items-center justify-center py-20">
      <div class="text-center">
        <Icon name="i-lucide-loader-2" class="size-10 animate-spin text-muted-foreground mx-auto mb-3" />
        <p class="text-muted-foreground text-sm">加载中...</p>
      </div>
    </div>

    <!-- Error -->
    <div v-else-if="!wallet && !isLoading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <Icon name="i-lucide-alert-circle" class="size-12 text-destructive mx-auto mb-4" />
        <p class="text-destructive">钱包不存在</p>
        <Button variant="outline" class="mt-4" asChild>
          <NuxtLink to="/paper">返回钱包列表</NuxtLink>
        </Button>
      </div>
    </div>

    <!-- Content -->
    <template v-else-if="wallet">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <NuxtLink to="/paper">
            <Button variant="ghost" size="icon" class="shrink-0">
              <Icon name="i-lucide-arrow-left" class="size-5" />
            </Button>
          </NuxtLink>
          <span class="text-xl leading-none">{{ marketInfo.flag }}</span>
          <h2 class="text-2xl font-bold tracking-tight">
            {{ wallet.name }}
          </h2>
          <Badge variant="secondary" class="text-xs">
            {{ marketInfo.label }}
          </Badge>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" @click="openAddPositionDialog()">
            <Icon name="i-lucide-folder-plus" class="mr-2 size-4" />
            录入持仓
          </Button>
          <Button @click="openOrderDialog('buy')">
            <Icon name="i-lucide-shopping-cart" class="mr-2 size-4" />
            下单
          </Button>
          <Button variant="destructive" @click="showResetDialog = true">
            <Icon name="i-lucide-refresh-cw" class="mr-2 size-4" />
            重置
          </Button>
        </div>
      </div>

      <!-- Account Summary -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader class="pb-2">
            <CardDescription class="text-sm">可用资金</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-bold">
              {{ currencySymbol }}{{ formatAmount(wallet.cash) }}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription class="text-sm">持仓市值</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-bold">
              {{ currencySymbol }}{{ formatAmount(positionsValue) }}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription class="text-sm">总资产</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-bold">
              {{ currencySymbol }}{{ formatAmount(wallet.totalAssets ?? wallet.cash + positionsValue) }}
            </p>
            <p v-if="totalPnl !== 0" :class="['text-xs font-medium mt-1', totalPnl >= 0 ? 'text-emerald-500' : 'text-red-500']">
              {{ totalPnl >= 0 ? '+' : '' }}{{ formatAmount(totalPnl) }}
              ({{ totalPnlPercent >= 0 ? '+' : '' }}{{ totalPnlPercent.toFixed(2) }}%)
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader class="pb-2">
            <CardDescription class="text-sm">初始资金</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-2xl font-bold">
              {{ currencySymbol }}{{ formatAmount(Number(wallet.initialBalance)) }}
            </p>
          </CardContent>
        </Card>
      </div>

      <!-- Positions Table -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-lg">持仓</CardTitle>
          <CardDescription v-if="positions.length > 0">
            共 {{ positions.length }} 只持仓
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="positions.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            暂无持仓，下单或手动录入添加
          </div>
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead class="text-right">数量</TableHead>
                <TableHead class="text-right">均价</TableHead>
                <TableHead class="text-right">最新价</TableHead>
                <TableHead class="text-right">市值</TableHead>
                <TableHead class="text-right">浮盈</TableHead>
                <TableHead class="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="position in positions" :key="position.id">
                <TableCell>
                  <NuxtLink :to="`/stock/${position.stockCode}`" class="font-medium text-primary hover:underline">
                    {{ position.stockCode }}
                  </NuxtLink>
                </TableCell>
                <TableCell class="text-muted-foreground">
                  {{ position.stockName || '-' }}
                </TableCell>
                <TableCell class="text-right">{{ position.quantity }}</TableCell>
                <TableCell class="text-right">{{ formatAmount(position.avgCost) }}</TableCell>
                <TableCell class="text-right">{{ formatAmount(position.lastPrice) }}</TableCell>
                <TableCell class="text-right">{{ formatAmount(position.marketValue) }}</TableCell>
                <TableCell>
                  <div :class="['text-right', position.unrealizedPnl >= 0 ? 'text-emerald-500' : 'text-red-500']">
                    <p>{{ position.unrealizedPnl >= 0 ? '+' : '' }}{{ formatAmount(position.unrealizedPnl) }}</p>
                    <p class="text-xs">{{ position.unrealizedPnlPercent >= 0 ? '+' : '' }}{{ position.unrealizedPnlPercent.toFixed(2) }}%</p>
                  </div>
                </TableCell>
                <TableCell>
                  <div class="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <NuxtLink :to="`/research?symbol=${position.stockCode}`">
                        分析
                      </NuxtLink>
                    </Button>
                    <Button variant="outline" size="sm" @click="openOrderDialog('sell', position.stockCode)">
                      卖出
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <!-- Orders Table -->
      <Card>
        <CardHeader class="pb-3">
          <CardTitle class="text-lg">订单记录</CardTitle>
          <CardDescription v-if="orders.length > 0">
            共 {{ orders.length }} 条记录
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="orders.length === 0" class="py-8 text-center text-sm text-muted-foreground">
            暂无订单记录
          </div>
          <Table v-else>
            <TableHeader>
              <TableRow>
                <TableHead>时间</TableHead>
                <TableHead>方向</TableHead>
                <TableHead>代码</TableHead>
                <TableHead class="text-right">价格</TableHead>
                <TableHead class="text-right">数量</TableHead>
                <TableHead class="text-right">金额</TableHead>
                <TableHead>状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="order in orders" :key="order.id">
                <TableCell class="text-muted-foreground whitespace-nowrap">
                  {{ order.createdAt ? new Date(order.createdAt).toLocaleString('zh-CN') : '-' }}
                </TableCell>
                <TableCell>
                  <Badge :variant="order.side === 'buy' ? 'default' : 'destructive'">
                    {{ order.side === 'buy' ? '买入' : '卖出' }}
                  </Badge>
                </TableCell>
                <TableCell class="font-medium">{{ order.stockCode }}</TableCell>
                <TableCell class="text-right">{{ formatAmount(Number(order.price)) }}</TableCell>
                <TableCell class="text-right">{{ order.quantity }}</TableCell>
                <TableCell class="text-right">{{ formatAmount(Number(order.amount)) }}</TableCell>
                <TableCell>
                  <Badge variant="outline" class="text-xs">
                    {{ order.status }}
                  </Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </template>

    <!-- Order Dialog -->
    <Dialog v-model:open="showOrderDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{{ orderForm.side === 'buy' ? '买入' : '卖出' }}订单</DialogTitle>
          <DialogDescription>提交{{ orderForm.side === 'buy' ? '买入' : '卖出' }}订单</DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label>方向</Label>
            <div class="flex rounded-lg border p-1">
              <Button
                variant="default"
                size="sm"
                class="flex-1"
                :class="orderForm.side === 'buy' ? '' : 'bg-transparent text-foreground shadow-none hover:bg-muted hover:text-foreground'"
                @click="orderForm.side = 'buy'"
              >
                买入
              </Button>
              <Button
                variant="default"
                size="sm"
                class="flex-1"
                :class="orderForm.side === 'sell' ? '' : 'bg-transparent text-foreground shadow-none hover:bg-muted hover:text-foreground'"
                @click="orderForm.side = 'sell'"
              >
                卖出
              </Button>
            </div>
          </div>
          <div class="space-y-2">
            <Label for="order-code">股票代码</Label>
            <Input
              id="order-code"
              v-model="orderForm.stock_code"
              placeholder="例如: AAPL, TSLA"
            />
          </div>
          <div class="space-y-2">
            <Label for="order-quantity">数量</Label>
            <Input
              id="order-quantity"
              v-model.number="orderForm.quantity"
              type="number"
              min="1"
              placeholder="1"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showOrderDialog = false">
            取消
          </Button>
          <Button :disabled="!orderForm.stock_code.trim() || orderForm.quantity <= 0 || isPlacingOrder" @click="handlePlaceOrder">
            <Icon v-if="isPlacingOrder" name="i-lucide-loader-2" class="mr-2 size-4 animate-spin" />
            {{ isPlacingOrder ? '提交中...' : '提交订单' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Add Position Dialog -->
    <Dialog v-model:open="showAddPositionDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>录入持仓</DialogTitle>
          <DialogDescription>手动录入持仓（不会扣除现金）</DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="add-code">股票代码</Label>
            <Input
              id="add-code"
              v-model="addPositionForm.stock_code"
              placeholder="例如: AAPL, TSLA"
            />
          </div>
          <div class="space-y-2">
            <Label for="add-quantity">数量</Label>
            <Input
              id="add-quantity"
              v-model.number="addPositionForm.quantity"
              type="number"
              min="1"
              placeholder="1"
            />
          </div>
          <div class="space-y-2">
            <Label for="add-cost">均价</Label>
            <Input
              id="add-cost"
              v-model.number="addPositionForm.avg_cost"
              type="number"
              min="0"
              step="0.01"
              placeholder="100.00"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showAddPositionDialog = false">
            取消
          </Button>
          <Button
            :disabled="!addPositionForm.stock_code.trim() || addPositionForm.quantity <= 0 || addPositionForm.avg_cost <= 0 || isAddingPosition"
            @click="handleAddPosition"
          >
            <Icon v-if="isAddingPosition" name="i-lucide-loader-2" class="mr-2 size-4 animate-spin" />
            {{ isAddingPosition ? '录入中...' : '录入' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Reset Confirm Dialog -->
    <Dialog v-model:open="showResetDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>重置钱包</DialogTitle>
          <DialogDescription>此操作将清除所有持仓和订单记录</DialogDescription>
        </DialogHeader>
        <div class="py-4">
          <div class="rounded-lg border border-destructive/50 bg-destructive/5 p-4 text-sm">
            <div class="flex items-start gap-3">
              <Icon name="i-lucide-alert-triangle" class="mt-0.5 size-5 shrink-0 text-destructive" />
              <div class="space-y-1">
                <p class="font-medium text-destructive">警告</p>
                <p class="text-muted-foreground">
                  此操作将清除钱包中的所有持仓和订单记录，并将可用资金重置为初始金额。此操作不可撤销，请谨慎操作。
                </p>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showResetDialog = false">
            取消
          </Button>
          <Button variant="destructive" :disabled="isResetting" @click="handleReset">
            <Icon v-if="isResetting" name="i-lucide-loader-2" class="mr-2 size-4 animate-spin" />
            {{ isResetting ? '重置中...' : '确认重置' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
