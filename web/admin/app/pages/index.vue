<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const auth = useAuth()
const watchlist = useWatchlist()

const groups = ref<WatchlistGroup[]>([])
const isLoading = ref(true)

onMounted(async () => {
  try {
    groups.value = await watchlist.getGroups()
  }
  catch (error) {
    console.error('Failed to load watchlist groups:', error)
  }
  finally {
    isLoading.value = false
  }
})
</script>

<template>
  <div class="w-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">
          Welcome back, {{ auth.user.value?.username }}!
        </h2>
        <p class="text-muted-foreground">
          Here's an overview of your trading portfolio
        </p>
      </div>
    </div>

    <main class="flex flex-1 flex-col gap-4">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Watchlist Groups
            </CardTitle>
            <Icon name="i-lucide-star" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ groups.length }}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Total Items
            </CardTitle>
            <Icon name="i-lucide-list" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{ groups.reduce((acc, g) => acc + (g as any).itemsCount || 0, 0) }}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Today's Change
            </CardTitle>
            <Icon name="i-lucide-trending-up" class="size-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold text-green-500">
              +2.4%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">
              Portfolio Value
            </CardTitle>
            <Icon name="i-lucide-wallet" class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              $12,345
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- Quick Actions -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card class="col-span-4">
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>
              Common tasks and features
            </CardDescription>
          </CardHeader>
          <CardContent class="grid gap-4 md:grid-cols-2">
            <Button variant="outline" class="h-auto flex-col gap-2 py-4" as-child>
              <NuxtLink to="/watchlist">
                <Icon name="i-lucide-star" class="size-6" />
                <span>Manage Watchlist</span>
              </NuxtLink>
            </Button>
            <Button variant="outline" class="h-auto flex-col gap-2 py-4" disabled>
              <Icon name="i-lucide-trending-up" class="size-6" />
              <span>Market Data</span>
            </Button>
            <Button variant="outline" class="h-auto flex-col gap-2 py-4" disabled>
              <Icon name="i-lucide-flask-conical" class="size-6" />
              <span>Run Backtest</span>
            </Button>
            <Button variant="outline" class="h-auto flex-col gap-2 py-4" disabled>
              <Icon name="i-lucide-filter" class="size-6" />
              <span>Stock Screener</span>
            </Button>
          </CardContent>
        </Card>

        <Card class="col-span-3">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>
              Your latest watchlist changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div class="text-sm text-muted-foreground text-center py-4">
              No recent activity
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  </div>
</template>
