<template>
  <div class="space-y-4">
    <div v-if="result.status === 'failed'" class="border border-red-300 rounded p-4 text-red-600">
      回测失败：{{ result.error }}
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-3">
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">总收益</div>
          <div class="text-lg font-bold" :class="result.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-600'">
            {{ (result.metrics.totalReturn * 100).toFixed(2) }}%
          </div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">Sharpe</div>
          <div class="text-lg font-bold">{{ result.metrics.sharpe?.toFixed(2) || '-' }}</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">最大回撤</div>
          <div class="text-lg font-bold text-red-600">{{ ((result.metrics.maxDrawdown || 0) * 100).toFixed(2) }}%</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">胜率</div>
          <div class="text-lg font-bold">{{ ((result.metrics.winRate || 0) * 100).toFixed(1) }}%</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">盈亏比</div>
          <div class="text-lg font-bold">{{ (result.metrics.profitFactor || 0).toFixed(2) }}</div>
        </div>
        <div class="border rounded p-3 text-center">
          <div class="text-xs text-muted-foreground">交易次数</div>
          <div class="text-lg font-bold">{{ result.metrics.tradeCount || 0 }}</div>
        </div>
      </div>

      <div v-if="result.trades?.length">
        <h3 class="font-semibold mb-2 text-sm">交易记录</h3>
        <div class="max-h-48 overflow-y-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b">
                <th class="text-left py-1">时间</th>
                <th class="text-left py-1">方向</th>
                <th class="text-right py-1">价格</th>
                <th class="text-right py-1">盈亏</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(t, i) in result.trades" :key="i" class="border-b">
                <td class="py-1">{{ t.time }}</td>
                <td class="py-1" :class="t.side === 'buy' ? 'text-green-600' : 'text-red-600'">{{ t.side }}</td>
                <td class="text-right py-1">{{ Number(t.price).toFixed(2) }}</td>
                <td class="text-right py-1" :class="t.pnl > 0 ? 'text-green-600' : t.pnl < 0 ? 'text-red-600' : ''">
                  {{ t.pnl != null ? (t.pnl > 0 ? '+' : '') + Number(t.pnl).toFixed(0) : '-' }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{ result: any }>()
</script>
