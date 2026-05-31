<script setup lang="ts">
const props = defineProps<{
  symbol: string
}>()

const { result, loading, error, analyze, llmResult, llmLoading, llmError, analyzeWithLLM } = useChanAnalysis()

watch(() => props.symbol, (newSymbol) => {
  if (newSymbol) {
    analyze(newSymbol)
    llmResult.value = null
  }
}, { immediate: true })

const biSummary = computed(() => {
  if (!result.value?.bi_list.length) return null
  const list = result.value.bi_list
  const last = list[list.length - 1]!
  const upCount = list.filter(b => b.direction === 'up').length
  const downCount = list.length - upCount
  return `共${list.length}笔（↑${upCount} ↓${downCount}），最后${last.direction === 'up' ? '↑' : '↓'}${last.strength.toFixed(1)}%`
})
</script>

<template>
  <div class="space-y-6">
    <!-- 加载 -->
    <div v-if="loading && !result" class="flex flex-col items-center justify-center py-20">
      <Icon name="i-lucide-loader-2" class="size-10 animate-spin text-muted-foreground mb-4" />
      <p class="text-muted-foreground">正在执行缠论分析...</p>
    </div>

    <!-- 错误 -->
    <div v-else-if="error" class="flex flex-col items-center justify-center py-20">
      <p class="text-destructive mb-2">{{ error }}</p>
      <Button variant="outline" size="sm" @click="analyze(symbol)">
        重试
      </Button>
    </div>

    <!-- 结果 -->
    <div v-else-if="result" class="space-y-4">
      <!-- 结构摘要 -->
      <Card>
        <CardHeader class="pb-2">
          <div class="flex items-center justify-between">
            <CardTitle class="text-base">结构摘要</CardTitle>
            <div class="flex items-center gap-2">
              <Button variant="outline" size="sm" :disabled="llmLoading" @click="analyzeWithLLM(symbol)">
                <Icon name="i-lucide-sparkles" class="size-4 mr-1" />
                {{ llmResult ? '重新分析' : 'AI 分析' }}
              </Button>
              <Button variant="ghost" size="sm" :disabled="loading" @click="analyze(symbol)">
                <Icon name="i-lucide-refresh-cw" class="size-4" :class="{ 'animate-spin': loading }" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p class="text-lg font-medium">{{ result.summary }}</p>
          <p v-if="biSummary" class="text-sm text-muted-foreground mt-2">{{ biSummary }}</p>
        </CardContent>
      </Card>

      <!-- LLM 分析 -->
      <Card>
        <CardHeader class="pb-2">
          <CardTitle class="text-base flex items-center gap-2">
            <Icon name="i-lucide-sparkles" class="size-4" />
            AI 分析
          </CardTitle>
        </CardHeader>
        <CardContent>
          <!-- LLM 加载 -->
          <div v-if="llmLoading" class="flex flex-col items-center justify-center py-8">
            <Icon name="i-lucide-loader-2" class="size-8 animate-spin text-muted-foreground mb-3" />
            <p class="text-sm text-muted-foreground">AI 正在分析缠论结构...</p>
          </div>

          <!-- LLM 错误 -->
          <div v-else-if="llmError" class="text-center py-8">
            <p class="text-destructive mb-2">{{ llmError }}</p>
            <Button variant="outline" size="sm" @click="analyzeWithLLM(symbol)">重试</Button>
          </div>

          <!-- LLM 结果 -->
          <div v-else-if="llmResult" class="space-y-4">
            <!-- 位置 + 总结 -->
            <div class="p-4 rounded-lg bg-muted/50">
              <p class="font-medium">{{ llmResult.position }}</p>
              <p class="text-sm text-muted-foreground mt-2">{{ llmResult.summary }}</p>
            </div>

            <!-- 中枢分析 + 买卖点 -->
            <div class="grid grid-cols-2 gap-4">
              <div v-if="llmResult.zs_analysis" class="p-3 rounded-lg border">
                <p class="text-xs text-muted-foreground mb-1">中枢分析</p>
                <p class="text-sm">
                  {{ llmResult.zs_analysis.level }}{{ llmResult.zs_analysis.type }}
                  <span class="text-muted-foreground">· 共 {{ llmResult.zs_analysis.count }} 个</span>
                </p>
                <div v-if="llmResult.zs_analysis.current_zs" class="text-xs text-muted-foreground mt-1 font-mono">
                  ZG {{ llmResult.zs_analysis.current_zs.zg }} / ZD {{ llmResult.zs_analysis.current_zs.zd }}
                </div>
              </div>

              <div v-if="llmResult.bsp_signals?.length" class="p-3 rounded-lg border">
                <p class="text-xs text-muted-foreground mb-1">买卖点信号</p>
                <div v-for="(bsp, i) in llmResult.bsp_signals" :key="i" class="text-sm">
                  <Badge :variant="bsp.type.includes('买') ? 'default' : 'destructive'" class="mr-1">
                    {{ bsp.type }}
                  </Badge>
                  <span class="text-muted-foreground text-xs">{{ bsp.significance }}</span>
                </div>
              </div>
            </div>

            <!-- 背驰 -->
            <div v-if="llmResult.divergence" class="p-3 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
              <p class="text-sm font-medium">{{ llmResult.divergence.type }}</p>
              <p class="text-xs text-muted-foreground">{{ llmResult.divergence.implication }}</p>
            </div>

            <!-- 操作建议 -->
            <div v-if="llmResult.suggestion" class="p-3 rounded-lg bg-muted/30">
              <p class="text-xs text-muted-foreground mb-1">操作建议</p>
              <p class="text-sm">{{ llmResult.suggestion }}</p>
            </div>
          </div>

          <!-- 初始状态 -->
          <div v-else class="text-center py-8">
            <p class="text-sm text-muted-foreground">点击「AI 分析」让 AI 解读缠论结构，判断买卖点</p>
          </div>
        </CardContent>
      </Card>

      <!-- 中枢 + 笔 -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <!-- 中枢列表 -->
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-base">中枢 ({{ result.zs_list.length }})</CardTitle>
          </CardHeader>
          <CardContent>
            <div v-if="result.zs_list.length === 0" class="text-sm text-muted-foreground py-4 text-center">
              暂无中枢
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="(zs, i) in result.zs_list"
                :key="i"
                class="p-3 rounded-lg border"
                :class="zs.type === '上涨中枢' ? 'border-green-200 bg-green-50 dark:bg-green-950/20' : 'border-red-200 bg-red-50 dark:bg-red-950/20'"
              >
                <div class="flex items-center justify-between mb-2">
                  <Badge :variant="zs.type === '上涨中枢' ? 'default' : 'destructive'">
                    {{ zs.type }}
                  </Badge>
                  <span class="text-xs text-muted-foreground">{{ zs.level }}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span class="text-muted-foreground">中枢上沿 (ZG):</span>
                    <span class="font-mono font-medium ml-1">{{ zs.zg.toFixed(2) }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">中枢下沿 (ZD):</span>
                    <span class="font-mono font-medium ml-1">{{ zs.zd.toFixed(2) }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">最高:</span>
                    <span class="font-mono ml-1">{{ zs.high.toFixed(2) }}</span>
                  </div>
                  <div>
                    <span class="text-muted-foreground">最低:</span>
                    <span class="font-mono ml-1">{{ zs.low.toFixed(2) }}</span>
                  </div>
                </div>
                <div class="text-xs text-muted-foreground mt-2">
                  {{ zs.start_time }} ~ {{ zs.end_time }}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <!-- 笔列表 -->
        <Card>
          <CardHeader class="pb-2">
            <CardTitle class="text-base">笔 ({{ result.bi_list.length }})</CardTitle>
          </CardHeader>
          <CardContent>
            <div class="overflow-x-auto max-h-80 overflow-y-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b text-left text-muted-foreground sticky top-0 bg-card">
                    <th class="pb-2 w-10">#</th>
                    <th class="pb-2">方向</th>
                    <th class="pb-2 text-right">起始价</th>
                    <th class="pb-2 text-right">结束价</th>
                    <th class="pb-2 text-right">幅度</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(bi, i) in result.bi_list" :key="i" class="border-b last:border-0">
                    <td class="py-1.5 text-muted-foreground text-xs">{{ i + 1 }}</td>
                    <td class="py-1.5">
                      <Badge :variant="bi.direction === 'up' ? 'default' : 'destructive'" class="text-xs">
                        {{ bi.direction === 'up' ? '↑' : '↓' }}
                      </Badge>
                    </td>
                    <td class="py-1.5 text-right font-mono text-xs">{{ bi.start_price.toFixed(2) }}</td>
                    <td class="py-1.5 text-right font-mono text-xs">{{ bi.end_price.toFixed(2) }}</td>
                    <td class="py-1.5 text-right text-xs" :class="bi.strength > 0 ? 'text-green-500' : 'text-red-500'">
                      {{ bi.strength > 0 ? '+' : '' }}{{ bi.strength.toFixed(1) }}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
