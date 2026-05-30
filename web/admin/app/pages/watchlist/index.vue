<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({
  middleware: 'auth',
})

type Interval = '1d' | '1w' | '1M'

const watchlist = useWatchlist()
const stockQuotes = useStockQuotes()

const groups = ref<WatchlistGroup[]>([])
const selectedGroup = ref<WatchlistGroup | null>(null)
const items = ref<WatchlistItem[]>([])
const isLoadingGroups = ref(false)
const isLoadingItems = ref(false)
const isLoadingQuotes = ref(false)

// Dialog states
const showCreateGroup = ref(false)
const showAddItem = ref(false)
const isAdding = ref(false)
const showStockDetail = ref(false)
const selectedStock = ref<WatchlistItem | null>(null)

// Form data
const newGroup = reactive({ name: '', description: '' })
const newItem = reactive({ symbol: '' })

// Current interval for chart
const currentInterval = ref<Interval>('1d')

async function loadGroups() {
  isLoadingGroups.value = true
  try {
    groups.value = await watchlist.getGroups()
    if (groups.value.length > 0 && !selectedGroup.value) {
      await selectGroup(groups.value[0])
    }
  }
  catch (error: any) {
    toast.error(error.message || '加载失败')
  }
  finally {
    isLoadingGroups.value = false
  }
}

async function selectGroup(group: WatchlistGroup | undefined) {
  if (!group) return
  selectedGroup.value = group
  await loadItems()
}

async function loadItems() {
  if (!selectedGroup.value)
    return

  isLoadingItems.value = true
  try {
    items.value = await watchlist.getItems(selectedGroup.value.id)
    // Load quotes for the items
    await loadQuotes()
  }
  catch (error: any) {
    toast.error(error.message || '加载失败')
  }
  finally {
    isLoadingItems.value = false
  }
}

async function loadQuotes() {
  if (!selectedGroup.value) {
    return
  }

  isLoadingQuotes.value = true
  try {
    await stockQuotes.getGroupQuotes(selectedGroup.value.id, currentInterval.value)
  }
  catch (error: any) {
    console.error('Failed to load quotes:', error)
    // Don't show toast for quote loading errors, just log them
  }
  finally {
    isLoadingQuotes.value = false
  }
}

async function handleRefresh() {
  if (!selectedGroup.value) {
    return
  }

  isLoadingQuotes.value = true
  try {
    await stockQuotes.refreshGroup(selectedGroup.value.id, currentInterval.value)
    await loadQuotes()
    toast.success('Quotes refreshed')
  }
  catch (error: any) {
    toast.error(error.message || '刷新失败')
  } finally {
    isLoadingQuotes.value = false
  }
}

function handleIntervalChange(interval: Interval) {
  currentInterval.value = interval
}

function handleFilter() {
  // Placeholder for filter functionality
  toast.info('Filter functionality coming soon')
}

function handleViewDetail(item: WatchlistItem) {
  selectedStock.value = item
  showStockDetail.value = true
}

async function handleCreateGroup() {
  try {
    await watchlist.createGroup(newGroup)
    await loadGroups()
    showCreateGroup.value = false
    newGroup.name = ''
    newGroup.description = ''
    toast.success('Group created')
  }
  catch (error: any) {
    toast.error(error.message || '创建失败')
  }
}

async function handleDeleteGroup(group: WatchlistGroup) {
  if (!confirm(`Delete group "${group.name}"?`))
    return

  try {
    await watchlist.deleteGroup(group.id)
    if (selectedGroup.value?.id === group.id) {
      selectedGroup.value = null
      items.value = []
    }
    await loadGroups()
    toast.success('Group deleted')
  }
  catch (error: any) {
    toast.error(error.message || '删除失败')
  }
}

async function handleAddItem() {
  if (!selectedGroup.value || isAdding.value)
    return

  isAdding.value = true
  try {
    await watchlist.addItem(selectedGroup.value.id, { symbol: newItem.symbol })
    await loadItems()
    showAddItem.value = false
    newItem.symbol = ''
    toast.success('添加成功')
  }
  catch (error: any) {
    toast.error(error.message || '添加失败')
  }
  finally {
    isAdding.value = false
  }
}

async function handleDeleteItem(item: WatchlistItem) {
  if (!confirm(`Remove ${item.symbol} from watchlist?`))
    return

  try {
    await watchlist.deleteItem(item.id)
    await loadItems()
    toast.success('Item removed')
  }
  catch (error: any) {
    toast.error(error.message || '删除失败')
  }
}

onMounted(() => {
  loadGroups()
})
</script>

<template>
  <div class="w-full flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h2 class="text-2xl font-bold tracking-tight">
        Watchlist
      </h2>
      <Button @click="showCreateGroup = true">
        <Icon name="i-lucide-plus" class="mr-2 size-4" />
        New Group
      </Button>
    </div>

    <div class="grid gap-4 lg:grid-cols-4">
      <!-- Groups Sidebar -->
      <Card class="lg:col-span-1">
        <CardHeader>
          <CardTitle>分组</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="isLoadingGroups" class="flex items-center justify-center py-4">
            <Icon name="i-lucide-loader-2" class="size-6 animate-spin text-muted-foreground" />
          </div>
          <div v-else-if="groups.length === 0" class="text-center py-4 text-sm text-muted-foreground">
            No groups yet
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="group in groups"
              :key="group.id"
              class="flex items-center justify-between rounded-lg border p-3 cursor-pointer transition-colors"
              :class="selectedGroup?.id === group.id ? 'bg-primary/10 border-primary' : 'hover:bg-muted/50'"
              @click="() => selectGroup(group)"
            >
              <div class="min-w-0">
                <p class="font-medium truncate">{{ group.name }}</p>
                <p v-if="group.description" class="text-xs text-muted-foreground truncate">
                  {{ group.description }}
                </p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 opacity-50 hover:opacity-100"
                @click.stop="handleDeleteGroup(group)"
              >
                <Icon name="i-lucide-trash-2" class="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <!-- Items List -->
      <Card class="lg:col-span-3">
        <CardHeader>
          <CardTitle v-if="selectedGroup">
            {{ selectedGroup.name }}
          </CardTitle>
          <CardTitle v-else>
            Select a group
          </CardTitle>
          <CardDescription v-if="selectedGroup">
            {{ selectedGroup.description || 'Manage your watchlist items' }}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div v-if="!selectedGroup" class="text-center py-12 text-muted-foreground">
            Select a group to view items
          </div>
          <div v-else class="space-y-4">
            <div class="flex justify-between items-center">
              <p class="text-sm text-muted-foreground">
                {{ items.length }} items
              </p>
              <div class="flex items-center gap-2">
                <Button variant="outline" size="sm" :disabled="isLoadingQuotes" @click="handleRefresh">
                  <Icon :name="isLoadingQuotes ? 'i-lucide-loader-2' : 'i-lucide-refresh-cw'" :class="['mr-2 size-4', isLoadingQuotes && 'animate-spin']" />
                  Refresh
                </Button>
                <Button size="sm" @click="showAddItem = true">
                  <Icon name="i-lucide-plus" class="mr-2 size-4" />
                  Add
                </Button>
              </div>
            </div>

            <WatchlistTable
              :items="items"
              :quotes="stockQuotes.quotes.value"
              :loading="isLoadingItems"
              @view-detail="handleViewDetail"
              @delete-item="handleDeleteItem"
            />
          </div>
        </CardContent>
      </Card>
    </div>

    <!-- Create Group Dialog -->
    <Dialog v-model:open="showCreateGroup">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Watchlist Group</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <div class="space-y-2">
            <Label for="group-name">Name</Label>
            <Input id="group-name" v-model="newGroup.name" placeholder="My Watchlist" />
          </div>
          <div class="space-y-2">
            <Label for="group-description">Description (optional)</Label>
            <Textarea
              id="group-description"
              v-model="newGroup.description"
              placeholder="Enter description"
              rows="3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showCreateGroup = false">
            Cancel
          </Button>
          <Button @click="handleCreateGroup" :disabled="!newGroup.name">
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Add Item Dialog -->
    <Dialog v-model:open="showAddItem">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add to Watchlist</DialogTitle>
        </DialogHeader>
        <div class="space-y-4 py-4">
          <StockSearchInput v-model="newItem.symbol" @select="handleAddItem" />
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showAddItem = false">
            Cancel
          </Button>
          <Button @click="handleAddItem" :disabled="!newItem.symbol || newItem.symbol.trim() === '' || isAdding">
            <Icon v-if="isAdding" name="i-lucide-loader-2" class="mr-2 size-4 animate-spin" />
            {{ isAdding ? '添加中...' : 'Add' }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <!-- Stock Detail Dialog -->
    <StockDetailDialog
      v-model:open="showStockDetail"
      :item="selectedStock"
    />
  </div>
</template>
