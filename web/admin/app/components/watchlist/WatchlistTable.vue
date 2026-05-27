<script setup lang="ts">
import type { WatchlistItem } from '@/composables/useWatchlist'
import type { StockQuote } from '@/composables/useStockQuotes'

interface Props {
  items: WatchlistItem[]
  quotes: Record<string, StockQuote>
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
})

const emit = defineEmits<{
  'view-detail': [item: WatchlistItem]
  'delete-item': [item: WatchlistItem]
}>()

function getChangeClass(changePercent?: number) {
  if (!changePercent) return ''
  if (changePercent > 0) return 'text-red-500'
  if (changePercent < 0) return 'text-green-500'
  return ''
}
</script>

<template>
  <div class="w-full">
    <div v-if="loading" class="flex items-center justify-center py-12">
      <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
    </div>
    <div v-else-if="items.length === 0" class="py-12 text-center text-muted-foreground text-sm">
      No items in this group
    </div>
    <div v-else>
      <!-- 表头 -->
      <div class="flex items-center justify-between py-2 px-1 text-xs text-muted-foreground border-b border-border">
        <span class="flex-1">股票</span>
        <span class="w-28 text-right">最新价</span>
        <span class="w-24 text-right">涨跌幅</span>
        <span class="w-20 text-right">操作</span>
      </div>
      <div class="divide-y divide-border">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-center justify-between py-3 px-1 hover:bg-muted/30 cursor-pointer transition-colors rounded"
        @click="navigateTo(`/stock/${item.symbol}`)"
      >
        <!-- 股票名 + 代码 -->
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium truncate">
            {{ item.nameCn || item.name || item.symbol }}
          </p>
          <p class="text-xs text-muted-foreground">
            {{ item.symbol }}
          </p>
        </div>

        <!-- 当前价格 -->
        <div class="w-28 text-right">
          <template v-if="quotes[item.symbol]">
            <p class="text-sm font-medium tabular-nums">
              {{ quotes[item.symbol].price.toFixed(2) }}
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">-</p>
        </div>

        <!-- 涨跌幅 -->
        <div class="w-24 text-right">
          <template v-if="quotes[item.symbol]">
            <p
              :class="[
                'text-sm font-medium tabular-nums',
                getChangeClass(quotes[item.symbol].changePercent),
              ]"
            >
              <span v-if="quotes[item.symbol].changePercent > 0">+</span>
              {{ quotes[item.symbol].changePercent.toFixed(2) }}%
            </p>
          </template>
          <p v-else class="text-sm text-muted-foreground">-</p>
        </div>

        <!-- 操作 -->
        <div class="w-20 text-right" @click.stop>
          <Button variant="ghost" size="icon" class="size-8" title="查看详情" @click.stop="navigateTo(`/stock/${item.symbol}`)">
            <Icon name="i-lucide-chart-bar" class="size-4" />
          </Button>
          <Button variant="ghost" size="icon" class="size-8 text-muted-foreground hover:text-destructive" title="删除" @click="emit('delete-item', item)">
            <Icon name="i-lucide-trash-2" class="size-4" />
          </Button>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>
