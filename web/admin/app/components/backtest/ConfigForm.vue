<template>
  <form class="space-y-4" @submit.prevent="submit">
    <div>
      <label class="block text-sm font-medium mb-1">股票代码</label>
      <input v-model="form.ticker" class="w-full border rounded px-3 py-2" placeholder="如 000001" required />
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">开始日期</label>
        <input v-model="form.startDate" type="date" class="w-full border rounded px-3 py-2" required />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">结束日期</label>
        <input v-model="form.endDate" type="date" class="w-full border rounded px-3 py-2" required />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm font-medium mb-1">费用模型</label>
        <select v-model="form.feeModel" class="w-full border rounded px-3 py-2">
          <option value="a_stock">A股</option>
          <option value="us_stock">美股</option>
          <option value="crypto">加密</option>
        </select>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">初始资金</label>
        <input v-model.number="form.initialCapital" type="number" class="w-full border rounded px-3 py-2" />
      </div>
    </div>
    <div>
      <label class="block text-sm font-medium mb-1">策略代码（Python）</label>
      <textarea v-model="form.strategyCode" class="w-full border rounded px-3 py-2 font-mono text-sm h-48"
        placeholder="import pandas as pd&#10;from engine.strategies import IndicatorStrategy&#10;&#10;class MyStrategy(IndicatorStrategy):&#10;    def generate_signals(self, df):&#10;        signals = pd.Series(0, index=df.index)&#10;        signals[df['close'] > df['close'].rolling(20).mean()] = 1&#10;        signals[df['close'] < df['close'].rolling(20).mean()] = -1&#10;        return signals"
        required />
    </div>
    <button type="submit" class="w-full bg-primary text-white py-2 rounded hover:opacity-90" :disabled="loading">
      {{ loading ? '回测中...' : '开始回测' }}
    </button>
  </form>
</template>

<script setup lang="ts">
defineProps<{ loading: boolean }>()
const emit = defineEmits<{ submit: [payload: any] }>()

const form = reactive({
  ticker: '',
  startDate: '2024-01-01',
  endDate: '2025-01-01',
  initialCapital: 1000000,
  feeModel: 'a_stock',
  strategyCode: '',
})

const submit = () => emit('submit', { ...form })
</script>
