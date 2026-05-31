<script setup lang="ts">
const props = defineProps<{
  symbol: string
  interval?: string
}>()

const {
  result,
  loading,
  error,
  analyze,
  getSignalBg,
  getSignalLabel,
  getDimensionLabel,
  getDimensionIcon,
  getDirectionLabel,
  getDirectionColor,
} = useTechnicalAnalysis()

watch(() => [props.symbol, props.interval ?? '1d'], ([newSymbol, newInterval]) => {
  if (newSymbol)
    analyze(newSymbol, newInterval)
}, { immediate: true })

// 关键因子（只显示最重要的几个）
const keyFactors = computed(() => {
  if (!result.value) return []
  const factorKeys = [
    'momentum_short', 'rsi_deviation', 'macd_hist_momentum',
    'volume_ratio', 'volume_price_corr', 'volatility_compression',
    'ema_cross_strength', 'pattern_score', 'gap_factor',
  ]
  const nameMap: Record<string, string> = {
    momentum_short: '短期动量',
    rsi_deviation: 'RSI偏离',
    macd_hist_momentum: 'MACD动能',
    volume_ratio: '量能偏离',
    volume_price_corr: '量价相关',
    volatility_compression: '波动压缩',
    ema_cross_strength: 'EMA交叉',
    pattern_score: '形态得分',
    gap_factor: '缺口因子',
  }
  return factorKeys
    .map(key => ({
      key,
      label: nameMap[key] || key,
      value: result.value!.factors[key],
    }))
    .filter(f => f.value !== null && f.value !== undefined)
})

// 因子值的颜色
function factorColor(val: number | null | undefined): string {
  if (val === null || val === undefined) return ''
  if (val > 0) return 'text-green-500'
  if (val < 0) return 'text-red-500'
  return ''
}

// score → 颜色
function scoreBarColor(score: number): string {
  if (score > 20) return 'bg-green-500'
  if (score < -20) return 'bg-red-500'
  return 'bg-yellow-500'
}
</script>

<template>
  <div class="space-y-6">
    <!-- 加载状态 -->
    <div v-if="loading && !result" class="flex flex-col items-center justify-center py-20">
      <Icon name="i-lucide-loader-2" class="size-10 animate-spin text-muted-foreground mb-4" />
      <p class="text-muted-foreground">正在执行技术面分析...</p>
    </div>

    <!-- 错误状态 -->
    <div v-else-if="error" class="flex flex-col items-center justify-center py-20">
      <Icon name="i-lucide-alert-circle" class="size-10 text-destructive mb-4" />
      <p class="text-destructive mb-2">{{ error }}</p>
      <Button variant="outline" size="sm" @click="analyze(symbol)">
        <Icon name="i-lucide-refresh-cw" class="size-4 mr-1" /> 重试
      </Button>
    </div>

    <!-- 分析结果 -->
    <div v-else-if="result" class="space-y-6">
      <!-- 第一行：综合评分卡片 -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <!-- 综合信号 -->
        <Card class="md:col-span-1">
          <CardContent class="pt-6 flex flex-col items-center justify-center text-center">
            <p class="text-sm text-muted-foreground mb-2">综合信号</p>
            <div
              :class="[
                'text-4xl font-bold px-6 py-3 rounded-xl border',
                getSignalBg(result.signal),
              ]"
            >
              {{ getSignalLabel(result.signal) }}
            </div>
            <div class="mt-3 flex items-baseline gap-2">
              <span class="text-3xl font-bold">{{ result.overall_score.toFixed(1) }}</span>
              <span class="text-sm text-muted-foreground">/ 100</span>
            </div>
            <p class="text-xs text-muted-foreground mt-1">
              置信度 {{ result.confidence.toFixed(1) }}%
            </p>
          </CardContent>
        </Card>

        <!-- 四维评分 -->
        <Card class="md:col-span-2">
          <CardHeader class="pb-3">
            <CardTitle class="text-base">四维评分</CardTitle>
          </CardHeader>
          <CardContent class="space-y-3">
            <div
              v-for="(dim, key) in result.dimensions"
              :key="key"
              class="flex items-center gap-3"
            >
              <Icon :name="getDimensionIcon(key)" class="size-4 text-muted-foreground shrink-0" />
              <span class="text-sm font-medium w-20 shrink-0">{{ getDimensionLabel(key) }}</span>
              <div class="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="scoreBarColor(dim.score)"
                  :style="{ width: `${Math.min(Math.abs(dim.score), 100)}%` }"
                />
              </div>
              <span
                :class="[
                  'text-sm font-semibold w-14 text-right',
                  dim.score > 20 ? 'text-green-500' : dim.score < -20 ? 'text-red-500' : 'text-yellow-500',
                ]"
              >
                {{ dim.score > 0 ? '+' : '' }}{{ dim.score.toFixed(0) }}
              </span>
              <Badge variant="outline" :class="getSignalBg(dim.signal)" class="text-xs px-2">
                {{ getSignalLabel(dim.signal) }}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 第二行：活跃信号 + 关键因子 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 活跃信号 -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">活跃信号</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="result.active_signals.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              当前无活跃信号
            </div>
            <div v-else class="space-y-2">
              <div
                v-for="sig in result.active_signals"
                :key="sig.name"
                class="flex items-center justify-between py-2 px-3 rounded-lg bg-muted/50"
              >
                <div class="flex items-center gap-2">
                  <span
                    :class="[
                      'text-xs font-medium px-2 py-0.5 rounded',
                      getDirectionColor(sig.direction),
                    ]"
                  >
                    {{ getDirectionLabel(sig.direction) }}
                  </span>
                  <span class="text-sm font-medium">{{ sig.name }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <div class="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      class="h-full rounded-full bg-primary transition-all"
                      :style="{ width: `${Math.min(sig.strength, 100)}%` }"
                    />
                  </div>
                  <span class="text-xs text-muted-foreground w-10 text-right">{{ sig.strength.toFixed(0) }}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 关键因子 -->
        <Card>
          <CardHeader class="pb-3">
            <CardTitle class="text-base">关键因子</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-3 gap-3">
              <div
                v-for="factor in keyFactors"
                :key="factor.key"
                class="text-center p-3 rounded-lg bg-muted/50"
              >
                <p class="text-xs text-muted-foreground mb-1">{{ factor.label }}</p>
                <p :class="['text-lg font-bold', factorColor(factor.value)]">
                  {{ factor.value!.toFixed(2) }}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <!-- 第三行：技术指标快照 -->
      <Card>
        <CardHeader class="pb-3">
          <div class="flex items-center justify-between">
            <CardTitle class="text-base">技术指标</CardTitle>
            <Button variant="ghost" size="sm" :disabled="loading" @click="analyze(symbol)">
              <Icon name="i-lucide-refresh-cw" class="size-4" :class="{ 'animate-spin': loading }" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div class="grid grid-cols-4 md:grid-cols-8 gap-3">
            <div
              v-for="(val, key) in result.indicators"
              :key="key"
              class="text-center p-2 rounded-lg bg-muted/30"
            >
              <p class="text-xs text-muted-foreground truncate" :title="key">{{ key }}</p>
              <p v-if="val !== null && val !== undefined" class="text-sm font-semibold">
                {{ typeof val === 'number' ? val.toFixed(2) : val }}
              </p>
              <p v-else class="text-sm text-muted-foreground">-</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
