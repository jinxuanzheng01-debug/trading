<script setup lang="ts">
import { toast } from 'vue-sonner'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'select': [symbol: string]
}>()

const open = ref(false)
const query = ref('')
const results = ref<Array<{ symbol: string; name: string; exchange: string }>>([])
const loading = ref(false)

const config = useRuntimeConfig()

async function search(q: string) {
  if (!q || q.trim().length === 0) {
    results.value = []
    return
  }

  loading.value = true
  try {
    const res = await $fetch<{ code: number; data: any[] }>(
      `${config.public.apiBase || ''}/api/stock/search?q=${encodeURIComponent(q.trim())}`
    )
    if (res.code === 0) {
      results.value = res.data.slice(0, 10)
    }
  } catch (e) {
    console.error('Search failed:', e)
  } finally {
    loading.value = false
  }
}

// Debounced search
let timer: ReturnType<typeof setTimeout> | null = null
function onInput(e: Event) {
  const target = e.target as HTMLInputElement
  query.value = target.value
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => search(query.value), 200)
}

function handleSelect(symbol: string) {
  emit('update:modelValue', symbol)
  emit('select', symbol)
  open.value = false
  query.value = ''
  results.value = []
}
</script>

<template>
  <div class="space-y-2">
    <Label>Search Stock</Label>
    <div class="relative">
      <input
        :value="query"
        class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        placeholder="Search by symbol or name..."
        autofocus
        @focus="open = true"
        @input="onInput"
        @keydown.escape="open = false"
      />
      <Icon
        v-if="loading"
        name="i-lucide-loader-2"
        class="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground"
      />
    </div>

    <!-- Dropdown results -->
    <div
      v-if="open && results.length > 0"
      class="absolute z-50 mt-1 max-h-60 w-[calc(100%-2rem)] overflow-auto rounded-md border bg-popover p-1 shadow-md"
    >
      <div
        v-for="item in results"
        :key="item.symbol"
        class="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent"
        @mousedown.prevent="handleSelect(item.symbol)"
      >
        <span class="font-medium">{{ item.symbol }}</span>
        <span class="text-muted-foreground truncate">{{ item.name }}</span>
        <span class="ml-auto shrink-0 text-xs text-muted-foreground">{{ item.exchange }}</span>
      </div>
    </div>

    <!-- No results -->
    <div
      v-if="open && query && !loading && results.length === 0"
      class="absolute z-50 mt-1 w-[calc(100%-2rem)] rounded-md border bg-popover p-4 text-center text-sm text-muted-foreground shadow-md"
    >
      No stocks found for "{{ query }}"
    </div>
  </div>
</template>
