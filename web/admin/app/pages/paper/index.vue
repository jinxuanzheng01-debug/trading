<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { PaperWallet } from '~/composables/usePaper'

definePageMeta({
  middleware: 'auth',
})

const paper = usePaper()

const wallets = ref<PaperWallet[]>([])
const isLoading = ref(false)
const showCreateDialog = ref(false)
const isCreating = ref(false)
const deletingId = ref<number | null>(null)

const newWallet = reactive({
  name: '',
  market: 'CN',
  initial_balance: 100000,
})

const marketConfig: Record<string, { flag: string; label: string; currency: string; symbol: string }> = {
  CN: { flag: '🇨🇳', label: 'A股', currency: 'CNY', symbol: '¥' },
  HK: { flag: '🇭🇰', label: '港股', currency: 'HKD', symbol: 'HK$' },
  US: { flag: '🇺🇸', label: '美股', currency: 'USD', symbol: '$' },
}

function getMarketConfig(market: string) {
  return marketConfig[market] || { flag: '🌐', label: market, currency: market, symbol: '$' }
}

function getCurrencySymbol(currency: string): string {
  if (currency === 'CNY') return '¥'
  if (currency === 'HKD') return 'HK$'
  if (currency === 'USD') return '$'
  return currency
}

function formatAmount(num: number): string {
  const abs = Math.abs(num)
  const sign = num < 0 ? '-' : ''
  if (abs >= 1e8) return sign + (abs / 1e8).toFixed(2) + '亿'
  if (abs >= 1e4) return sign + (abs / 1e4).toFixed(2) + '万'
  return num.toFixed(2)
}

async function loadWallets() {
  isLoading.value = true
  try {
    wallets.value = await paper.getWallets()
  }
  catch (error: any) {
    toast.error(error.message || '加载失败')
  }
  finally {
    isLoading.value = false
  }
}

async function handleCreate() {
  if (!newWallet.name.trim() || isCreating.value) return
  isCreating.value = true
  try {
    await paper.createWallet({
      name: newWallet.name,
      market: newWallet.market,
      initial_balance: newWallet.initial_balance,
    })
    await loadWallets()
    showCreateDialog.value = false
    newWallet.name = ''
    newWallet.market = 'CN'
    newWallet.initial_balance = 100000
    toast.success('钱包创建成功')
  }
  catch (error: any) {
    toast.error(error.message || '创建失败')
  }
  finally {
    isCreating.value = false
  }
}

async function handleDelete(id: number) {
  if (!confirm('确定删除此钱包？此操作不可撤销。')) return
  deletingId.value = id
  try {
    await paper.deleteWallet(id)
    wallets.value = wallets.value.filter(w => w.id !== id)
    toast.success('钱包已删除')
  }
  catch (error: any) {
    toast.error(error.message || '删除失败')
  }
  finally {
    deletingId.value = null
  }
}

onMounted(() => {
  loadWallets()
})
</script>

<template>
  <div class="w-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight">
        模拟交易
      </h2>
      <Button @click="showCreateDialog = true">
        <Icon name="i-lucide-plus" class="mr-2 size-4" />
        创建钱包
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex items-center justify-center py-20">
      <div class="text-center">
        <Icon name="i-lucide-loader-2" class="size-10 animate-spin text-muted-foreground mx-auto mb-3" />
        <p class="text-muted-foreground text-sm">加载中...</p>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="wallets.length === 0" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div class="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-muted">
          <Icon name="i-lucide-wallet" class="size-8 text-muted-foreground" />
        </div>
        <p class="text-muted-foreground mb-4">还没有钱包</p>
        <Button @click="showCreateDialog = true">
          <Icon name="i-lucide-plus" class="mr-2 size-4" />
          创建钱包
        </Button>
      </div>
    </div>

    <!-- Wallet Grid -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="wallet in wallets"
        :key="wallet.id"
        :to="`/paper/${wallet.id}`"
        class="block"
      >
        <Card class="h-full cursor-pointer transition-colors hover:bg-accent/50">
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="text-xl leading-none">{{ getMarketConfig(wallet.market).flag }}</span>
                <CardTitle class="text-base">{{ wallet.name }}</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 shrink-0 opacity-50 hover:opacity-100"
                :disabled="deletingId === wallet.id"
                @click.prevent.stop="handleDelete(wallet.id)"
              >
                <Icon
                  :name="deletingId === wallet.id ? 'i-lucide-loader-2' : 'i-lucide-trash-2'"
                  :class="['size-4', deletingId === wallet.id && 'animate-spin']"
                />
              </Button>
            </div>
            <CardDescription>
              {{ getMarketConfig(wallet.market).label }}
              <span class="mx-1">·</span>
              {{ wallet.currency || getMarketConfig(wallet.market).currency }}
            </CardDescription>
          </CardHeader>
          <CardContent class="space-y-2">
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">总资产</span>
              <span class="text-lg font-semibold">
                {{ getCurrencySymbol(wallet.currency || getMarketConfig(wallet.market).currency) }}{{ formatAmount(wallet.totalAssets ?? wallet.cash) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">盈亏</span>
              <span
                :class="[
                  'text-sm font-medium',
                  (wallet.totalPnl ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500',
                ]"
              >
                {{ (wallet.totalPnl ?? 0) >= 0 ? '+' : '' }}{{ formatAmount(wallet.totalPnl ?? 0) }}
              </span>
            </div>
            <div class="flex items-baseline justify-between">
              <span class="text-sm text-muted-foreground">持仓</span>
              <span class="text-sm">{{ wallet.positionCount ?? 0 }} 只</span>
            </div>
          </CardContent>
        </Card>
      </NuxtLink>
    </div>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreateDialog">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>创建钱包</DialogTitle>
          <DialogDescription>创建一个新的模拟交易钱包</DialogDescription>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="wallet-name">钱包名称</Label>
            <Input
              id="wallet-name"
              v-model="newWallet.name"
              placeholder="我的模拟钱包"
              @keyup.enter="handleCreate"
            />
          </div>
          <div class="space-y-2">
            <Label for="wallet-market">市场</Label>
            <Select v-model="newWallet.market">
              <SelectTrigger id="wallet-market">
                <SelectValue placeholder="选择市场" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CN">
                  🇨🇳 A股
                </SelectItem>
                <SelectItem value="HK">
                  🇭🇰 港股
                </SelectItem>
                <SelectItem value="US">
                  🇺🇸 美股
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div class="space-y-2">
            <Label for="wallet-balance">初始资金</Label>
            <Input
              id="wallet-balance"
              v-model.number="newWallet.initial_balance"
              type="number"
              min="0"
              placeholder="100000"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateDialog = false">
            取消
          </Button>
          <Button :disabled="!newWallet.name.trim() || isCreating" @click="handleCreate">
            <Icon v-if="isCreating" name="i-lucide-loader-2" class="mr-2 size-4 animate-spin" />
            {{ isCreating ? '创建中...' : '创建' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
