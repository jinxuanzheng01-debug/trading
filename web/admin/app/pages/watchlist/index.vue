<script setup lang="ts">
definePageMeta({
  middleware: 'auth',
})

const watchlist = useWatchlist()
const toast = useToast()

const groups = ref<WatchlistGroup[]>([])
const selectedGroup = ref<WatchlistGroup | null>(null)
const items = ref<WatchlistItem[]>([])
const isLoading = ref(false)

// Dialog states
const showCreateGroup = ref(false)
const showAddItem = ref(false)

// Form data
const newGroup = reactive({ name: '', description: '' })
const newItem = reactive({ symbol: '', name: '', type: 'stock' as const, exchange: '', notes: '' })

async function loadGroups() {
  isLoading.value = true
  try {
    groups.value = await watchlist.getGroups()
    if (groups.value.length > 0 && !selectedGroup.value) {
      await selectGroup(groups.value[0])
    }
  }
  catch (error: any) {
    toast({
      title: 'Failed to load groups',
      description: error.message,
      variant: 'destructive',
    })
  }
  finally {
    isLoading.value = false
  }
}

async function selectGroup(group: WatchlistGroup) {
  selectedGroup.value = group
  try {
    items.value = await watchlist.getItems(group.id)
  }
  catch (error: any) {
    toast({
      title: 'Failed to load items',
      description: error.message,
      variant: 'destructive',
    })
  }
}

async function handleCreateGroup() {
  try {
    await watchlist.createGroup(newGroup)
    await loadGroups()
    showCreateGroup.value = false
    newGroup.name = ''
    newGroup.description = ''
    toast({
      title: 'Group created',
      description: 'Watchlist group has been created',
    })
  }
  catch (error: any) {
    toast({
      title: 'Failed to create group',
      description: error.message,
      variant: 'destructive',
    })
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
    toast({
      title: 'Group deleted',
      description: 'Watchlist group has been deleted',
    })
  }
  catch (error: any) {
    toast({
      title: 'Failed to delete group',
      description: error.message,
      variant: 'destructive',
    })
  }
}

async function handleAddItem() {
  if (!selectedGroup.value)
    return

  try {
    await watchlist.addItem(selectedGroup.value.id, newItem)
    await selectGroup(selectedGroup.value)
    showAddItem.value = false
    newItem.symbol = ''
    newItem.name = ''
    newItem.exchange = ''
    newItem.notes = ''
    toast({
      title: 'Item added',
      description: 'Stock has been added to watchlist',
    })
  }
  catch (error: any) {
    toast({
      title: 'Failed to add item',
      description: error.message,
      variant: 'destructive',
    })
  }
}

async function handleDeleteItem(item: WatchlistItem) {
  if (!confirm(`Remove ${item.symbol} from watchlist?`))
    return

  try {
    await watchlist.deleteItem(item.id)
    if (selectedGroup.value) {
      await selectGroup(selectedGroup.value)
    }
    toast({
      title: 'Item removed',
      description: 'Stock has been removed from watchlist',
    })
  }
  catch (error: any) {
    toast({
      title: 'Failed to remove item',
      description: error.message,
      variant: 'destructive',
    })
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
          <CardTitle>Groups</CardTitle>
        </CardHeader>
        <CardContent>
          <div v-if="isLoading" class="flex items-center justify-center py-4">
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
              @click="selectGroup(group)"
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
              <Button size="sm" @click="showAddItem = true">
                <Icon name="i-lucide-plus" class="mr-2 size-4" />
                Add Item
              </Button>
            </div>

            <div v-if="items.length === 0" class="text-center py-12 text-muted-foreground">
              No items in this group yet
            </div>

            <Table v-else>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead class="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="item in items" :key="item.id">
                  <TableCell class="font-medium">
                    {{ item.symbol }}
                  </TableCell>
                  <TableCell>{{ item.name || '-' }}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {{ item.type }}
                    </Badge>
                  </TableCell>
                  <TableCell>{{ item.exchange || '-' }}</TableCell>
                  <TableCell class="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      class="size-8 text-destructive"
                      @click="handleDeleteItem(item)"
                    >
                      <Icon name="i-lucide-trash-2" class="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
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
          <div class="space-y-2">
            <Label for="symbol">Symbol *</Label>
            <Input id="symbol" v-model="newItem.symbol" placeholder="AAPL" />
          </div>
          <div class="space-y-2">
            <Label for="item-name">Name</Label>
            <Input id="item-name" v-model="newItem.name" placeholder="Apple Inc." />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <Label for="type">Type</Label>
              <Select v-model="newItem.type">
                <SelectTrigger id="type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stock">Stock</SelectItem>
                  <SelectItem value="etf">ETF</SelectItem>
                  <SelectItem value="index">Index</SelectItem>
                  <SelectItem value="crypto">Crypto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div class="space-y-2">
              <Label for="exchange">Exchange</Label>
              <Input id="exchange" v-model="newItem.exchange" placeholder="NASDAQ" />
            </div>
          </div>
          <div class="space-y-2">
            <Label for="notes">Notes</Label>
            <Textarea id="notes" v-model="newItem.notes" placeholder="Add notes..." rows="2" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" @click="showAddItem = false">
            Cancel
          </Button>
          <Button @click="handleAddItem" :disabled="!newItem.symbol">
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
