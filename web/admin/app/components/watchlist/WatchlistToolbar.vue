<script setup lang="ts">
type Interval = '1d' | '1w' | '1M'

interface Props {
  loading?: boolean
  currentInterval?: Interval
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  currentInterval: '1d',
})

const emit = defineEmits<{
  'interval-change': [interval: Interval]
  'refresh': []
  'filter': []
}>()

const intervals: { value: Interval; label: string }[] = [
  { value: '1d', label: '日线' },
  { value: '1w', label: '周线' },
  { value: '1M', label: '月线' },
]

function currentIntervalLabel() {
  return intervals.find(i => i.value === props.currentInterval)?.label || '日线'
}
</script>

<template>
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            {{ currentIntervalLabel() }}
            <Icon name="i-lucide-chevron-down" class="ml-2 size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem
            v-for="interval in intervals"
            :key="interval.value"
            @click="emit('interval-change', interval.value)"
          >
            {{ interval.label }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="outline" size="sm" @click="emit('filter')">
        <Icon name="i-lucide-filter" class="mr-2 size-4" />
        Filter
      </Button>
    </div>

    <Button
      variant="outline"
      size="sm"
      :disabled="loading"
      @click="emit('refresh')"
    >
      <Icon
        :name="loading ? 'i-lucide-loader-2' : 'i-lucide-refresh-cw'"
        :class="['mr-2 size-4', loading && 'animate-spin']"
      />
      Refresh
    </Button>
  </div>
</template>
