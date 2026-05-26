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

const sortColumn = ref<keyof StockQuote | 'symbol' | 'name'>('symbol')
const sortDirection = ref<'asc' | 'desc'>('asc')

function getSortValue(item: WatchlistItem) {
  const quote = props.quotes[item.symbol]
  switch (sortColumn.value) {
    case 'symbol':
      return item.symbol
    case 'name':
      return item.name || ''
    case 'price':
      return quote?.price || 0
    case 'change':
      return quote?.change || 0
    case 'changePercent':
      return quote?.changePercent || 0
    default:
      return ''
  }
}

const sortedItems = computed(() => {
  return [...props.items].sort((a, b) => {
    const aVal = getSortValue(a)
    const bVal = getSortValue(b)

    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortDirection.value === 'asc' ? aVal - bVal : bVal - aVal
    }

    const aStr = String(aVal).toLowerCase()
    const bStr = String(bVal).toLowerCase()

    if (sortDirection.value === 'asc') {
      return aStr.localeCompare(bStr)
    } else {
      return bStr.localeCompare(aStr)
    }
  })
})

function toggleSort(column: keyof StockQuote | 'symbol' | 'name') {
  if (sortColumn.value === column) {
    sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortColumn.value = column
    sortDirection.value = 'asc'
  }
}

function getSortIcon(column: keyof StockQuote | 'symbol' | 'name') {
  if (sortColumn.value !== column) {
    return 'i-lucide-arrow-up-down'
  }
  return sortDirection.value === 'asc'
    ? 'i-lucide-arrow-up'
    : 'i-lucide-arrow-down'
}

function getChangeClass(changePercent?: number) {
  if (!changePercent) return ''
  return changePercent > 0 ? 'text-green-500' : changePercent < 0 ? 'text-red-500' : ''
}

function getChangeIcon(changePercent?: number) {
  if (!changePercent) return ''
  return changePercent > 0 ? 'i-lucide-arrow-up' : changePercent < 0 ? 'i-lucide-arrow-down' : ''
}

function getTypeVariant(type: string) {
  switch (type) {
    case 'stock':
      return 'default'
    case 'etf':
      return 'secondary'
    case 'index':
      return 'outline'
    case 'crypto':
      return 'destructive'
    default:
      return 'default'
  }
}

function getMarketVariant(market?: string) {
  switch (market) {
    case 'US':
      return 'default'
    case 'HK':
      return 'secondary'
    case 'CN':
      return 'outline'
    default:
      return 'secondary'
  }
}
</script>

<template>
  <div class="w-full">
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1 font-medium"
              @click="toggleSort('symbol')"
            >
              Symbol
              <Icon :name="getSortIcon('symbol')" class="size-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1 font-medium"
              @click="toggleSort('name')"
            >
              Name
              <Icon :name="getSortIcon('name')" class="size-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1 font-medium"
              @click="toggleSort('price')"
            >
              Price
              <Icon :name="getSortIcon('price')" class="size-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1 font-medium"
              @click="toggleSort('change')"
            >
              Change
              <Icon :name="getSortIcon('change')" class="size-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button
              variant="ghost"
              size="sm"
              class="h-8 gap-1 font-medium"
              @click="toggleSort('changePercent')"
            >
              Change %
              <Icon :name="getSortIcon('changePercent')" class="size-4" />
            </Button>
          </TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Market</TableHead>
          <TableHead class="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow v-if="loading">
          <TableCell :colspan="8" class="h-24 text-center">
            <div class="flex items-center justify-center">
              <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
            </div>
          </TableCell>
        </TableRow>
        <TableRow v-else-if="items.length === 0">
          <TableCell :colspan="8" class="h-24 text-center text-muted-foreground">
            No items in this group
          </TableCell>
        </TableRow>
        <TableRow v-else v-for="item in sortedItems" :key="item.id" class="cursor-pointer hover:bg-muted/50">
          <TableCell class="font-medium">
            {{ item.symbol }}
          </TableCell>
          <TableCell>{{ item.name || '-' }}</TableCell>
          <TableCell>
            <template v-if="quotes[item.symbol]">
              {{ quotes[item.symbol]?.price.toFixed(2) }}
            </template>
            <span v-else class="text-muted-foreground">-</span>
          </TableCell>
          <TableCell>
            <template v-if="quotes[item.symbol]">
              <span :class="getChangeClass(quotes[item.symbol]?.changePercent)">
                <Icon :name="getChangeIcon(quotes[item.symbol]?.changePercent)" class="size-3 mr-1" />
                {{ quotes[item.symbol]?.change.toFixed(2) }}
              </span>
            </template>
            <span v-else class="text-muted-foreground">-</span>
          </TableCell>
          <TableCell>
            <template v-if="quotes[item.symbol]">
              <span :class="getChangeClass(quotes[item.symbol]?.changePercent)">
                <Icon :name="getChangeIcon(quotes[item.symbol]?.changePercent)" class="size-3 mr-1" />
                {{ quotes[item.symbol]?.changePercent.toFixed(2) }}%
              </span>
            </template>
            <span v-else class="text-muted-foreground">-</span>
          </TableCell>
          <TableCell>
            <Badge :variant="getTypeVariant(item.type)">
              {{ item.type }}
            </Badge>
          </TableCell>
          <TableCell>
            <Badge v-if="item.market" :variant="getMarketVariant(item.market)">
              {{ item.market }}
            </Badge>
            <span v-else class="text-muted-foreground text-sm">-</span>
          </TableCell>
          <TableCell class="text-right">
            <div class="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                @click.stop="emit('view-detail', item)"
              >
                <Icon name="i-lucide-eye" class="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-destructive"
                @click.stop="emit('delete-item', item)"
              >
                <Icon name="i-lucide-trash-2" class="size-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  </div>
</template>
