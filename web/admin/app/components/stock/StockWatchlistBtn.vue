<script setup lang="ts">
interface Props {
  symbol: string
}

const props = defineProps<Props>()

const { fetchWithAuth } = useAuth()
const config = useRuntimeConfig()

const isInWatchlist = ref(false)
const isLoading = ref(false)
const isChecking = ref(true)
const defaultGroupId = ref<number | null>(null)

async function checkWatchlistStatus() {
  isChecking.value = true
  try {
    const groups = await fetchWithAuth<any[]>(
      `${config.public.apiBase}/api/watchlist/groups`
    )

    const defaultGroup = groups.find((g: any) => g.isDefault)
    if (defaultGroup) {
      defaultGroupId.value = defaultGroup.id

      const items = await fetchWithAuth<any[]>(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroup.id}/items`
      )

      isInWatchlist.value = items.some((item: any) => item.symbol === props.symbol)
    }
  } catch (error) {
    console.error('Failed to check watchlist status:', error)
  } finally {
    isChecking.value = false
  }
}

async function toggleWatchlist() {
  if (!defaultGroupId.value || isLoading.value) return

  isLoading.value = true
  try {
    if (isInWatchlist.value) {
      const items = await fetchWithAuth<any[]>(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroupId.value}/items`
      )

      const item = items.find((i: any) => i.symbol === props.symbol)
      if (item) {
        await fetchWithAuth(
          `${config.public.apiBase}/api/watchlist/items/${item.id}`,
          { method: 'DELETE' }
        )
        isInWatchlist.value = false
      }
    } else {
      await fetchWithAuth(
        `${config.public.apiBase}/api/watchlist/groups/${defaultGroupId.value}/items`,
        {
          method: 'POST',
          body: JSON.stringify({ symbol: props.symbol }),
        }
      )
      isInWatchlist.value = true
    }
  } catch (error) {
    console.error('Failed to toggle watchlist:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  checkWatchlistStatus()
})
</script>

<template>
  <Button
    :variant="isInWatchlist ? 'secondary' : 'default'"
    :size="isInWatchlist ? 'sm' : 'default'"
    :disabled="isChecking || isLoading"
    @click="toggleWatchlist"
  >
    <Icon
      :name="isInWatchlist ? 'i-lucide-star-filled' : 'i-lucide-star'"
      class="size-4 mr-1"
    />
    {{ isInWatchlist ? '已收藏' : '收藏' }}
  </Button>
</template>
