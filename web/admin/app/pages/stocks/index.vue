<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

const config = useRuntimeConfig()
const { fetchWithAuth } = useAuth()
const router = useRouter()

const stocks = ref<any[]>([])
const loading = ref(false)
const searchQuery = ref('')
const page = ref(1)
const pageSize = 50

async function loadStocks() {
  loading.value = true
  try {
    const q = searchQuery.value ? `&q=${encodeURIComponent(searchQuery.value)}` : ''
    const res = await fetchWithAuth<any>(
      `${config.public.apiBase}/api/stock/list?page=${page.value}&pageSize=${pageSize}${q}`
    )
    stocks.value = res.items || res || []
  } catch (e: any) {
    console.error('Failed to load stocks:', e)
  } finally {
    loading.value = false
  }
}

function goDetail(symbol: string) {
  router.push(`/stock/${symbol}`)
}

let searchTimer: ReturnType<typeof setTimeout>
function onSearchInput() {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { page.value = 1; loadStocks() }, 300)
}

onMounted(() => loadStocks())
</script>

<template>
  <div class="w-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight">Stock List</h2>
      <div class="flex items-center gap-2">
        <input
          v-model="searchQuery"
          class="h-9 w-64 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder="Search by symbol or name..."
          @input="onSearchInput"
        />
      </div>
    </div>

    <Card>
      <CardContent class="p-0">
        <div v-if="loading" class="flex justify-center py-12">
          <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
        </div>
        <table v-else class="w-full">
          <thead>
            <tr class="border-b text-xs text-muted-foreground">
              <th class="px-4 py-3 text-left font-medium">Symbol</th>
              <th class="px-4 py-3 text-left font-medium">Name</th>
              <th class="px-4 py-3 text-left font-medium">Exchange</th>
              <th class="px-4 py-3 text-left font-medium">Type</th>
              <th class="px-4 py-3 text-left font-medium">Sector</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="s in stocks"
              :key="s.symbol"
              class="border-b cursor-pointer hover:bg-muted/50 transition-colors"
              @click="goDetail(s.symbol)"
            >
              <td class="px-4 py-2.5 font-medium text-sm">{{ s.symbol }}</td>
              <td class="px-4 py-2.5 text-sm text-muted-foreground truncate max-w-80">{{ s.name }}</td>
              <td class="px-4 py-2.5 text-sm">{{ s.exchange }}</td>
              <td class="px-4 py-2.5 text-sm">{{ s.type }}</td>
              <td class="px-4 py-2.5 text-sm text-muted-foreground">{{ s.sector || '-' }}</td>
            </tr>
          </tbody>
        </table>
      </CardContent>
    </Card>

    <div class="flex items-center justify-between text-sm text-muted-foreground">
      <span>{{ stocks.length }} stocks</span>
      <div class="flex gap-2">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--; loadStocks()">Prev</Button>
        <Button variant="outline" size="sm" @click="page++; loadStocks()">Next</Button>
      </div>
    </div>
  </div>
</template>
