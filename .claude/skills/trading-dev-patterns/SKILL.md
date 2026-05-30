---
name: trading-dev-patterns
description: Use when working on this trading-agent project - covers data architecture, dev workflow, TimescaleDB pitfalls, K-line chart patterns, and common bugs
---

# Trading Agent 开发模式

## 开发/部署

```bash
docker compose up -d          # 全部服务
docker compose build api web  # 只重建有改动的服务
docker compose logs -f api    # 查看日志
```

改代码后重建对应服务即可，利用 Docker 层缓存，通常 10-30 秒完成。

## 数据架构核心原则

**所有 API 读 PG，不穿透外部数据源。入库由 scheduler 定时任务负责。**

```
外部源 → market-data (无缓存，直连) → scheduler → PG → API → 前端
```

- **API 永远不调 yfinance**——首次请求慢就是这个原因
- **scheduler** 每天定时同步（基于 stocks 表全量，不再依赖用户自选列表）
- **market-data 已移除 Redis 缓存**——当前无高频读场景，直连即可
- **scheduler 启动时自动 seed**——klines 表为空则自动跑全量同步

## PG 表设计

### K 线：只存日线，周/月线 SQL 聚合

```sql
-- 日线：直读
SELECT * FROM klines WHERE stock_id = ? ORDER BY timestamp DESC LIMIT 252;

-- 周线：date_trunc 聚合
SELECT date_trunc('week', timestamp) as timestamp,
       (array_agg(open ORDER BY timestamp ASC))[1] as open,
       MAX(high), MIN(low),
       (array_agg(close ORDER BY timestamp))[array_upper(...)] as close,
       SUM(volume)
FROM klines WHERE stock_id = ?
GROUP BY date_trunc('week', timestamp)
ORDER BY timestamp DESC LIMIT 104;
```

**不要存日/周/月三份数据**——从日线聚合派生即可。

### 基本面：存最新快照，不是时序

`stock_fundamentals` 表 `stock_id` 为主键，UPSERT 更新。PE/PB 按季度财报变化，不需要每天存。

### 时间戳统一用 `timestamptz` (with time zone)

Drizzle schema：`timestamp('xxx', { withTimezone: true })`。所有业务时间都用带时区的，避免跨时区数据不一致。

## TimescaleDB 教训

**不要用 TimescaleDB，除非数据量到千万级。**

默认 chunk_interval = 7 天。9000 行数据被劈成 1900 个 chunk，每个查询扫描全部 chunk，1ms 的 SQL 变 1.5s。

**如果已经用了：用 `timescale/timescaledb` 镜像无法卸载扩展。唯一解法是切回 `postgres:16-alpine`，备份数据，重建表。**

普通 PG 表 + 复合主键 `(stock_id, timestamp)` + B-tree 索引，百万行以内毫秒级响应。

## K 线图开发

### 分页加载

`lightweight-charts` 的 `subscribeVisibleLogicalRangeChange` 回调参数是 **bar 索引**（不是时间戳），必须用 `timeScale.coordinateToTime()` 转换：

```typescript
chart.timeScale().subscribeVisibleLogicalRangeChange((logicalRange) => {
  const ts = chart.timeScale()
  const viewFrom = ts.coordinateToTime(logicalRange.from)  // → Unix timestamp
  const viewTo = ts.coordinateToTime(logicalRange.to)

  // 只有可视范围超出已加载数据才请求
  if (viewFrom < dataFrom) emit('load-more')  // 往前翻
})
```

**常见坑：直接用 `logicalRange.from` 和 Unix 时间戳比较**——一个是数字 1，一个是 1754236800，永远为 true，导致无限循环加载。

### 加载更多不调 fitContent()

`updateChart()` 只在首次渲染调 `fitContent()`。后续加载更多数据时保持用户当前缩放位置，否则每次加载完都被弹回全量视图。

### 数据去重

前端 merge 新旧数据时按 timestamp 去重。如果 API 返回的 start 参数已经覆盖了已有数据，`newItems.length === 0`，直接 return，避免空转。

## 前端搜索选择框

用 Nuxt 的 `$fetch` 直接调 `/api/stock/search?q=keyword`，结果渲染成下拉列表。不用 shadcn-vue 的 Command 组件——简单的 input + 绝对定位 div 就够了。

## 定时任务 & 数据同步

详细设计见 `docs/scheduler-design.md`。

### 架构

```
                  ┌─── 每天 15:35 CN 报价
                  ├─── 每天 16:35 HK 报价
yfinance ─┐       ├─── 每天 04:35 US 报价
          ├─ market-data ─┤
AkShare ─┘       ├─── 每天 05:00 US 基本面
                  ├─── 每天 06:00 全量 K线增量
                  │
                  └──► PostgreSQL (klines / stock_quotes / quote_snapshots / stock_fundamentals)
```

### 定时任务一览

| 任务 | Cron | 市场过滤 | 操作 | 写入表 |
|------|------|----------|------|--------|
| `sync_all_stock_klines` | `0 6 * * *` | 全量 | 查本地最新日期 → 增量/全量拉日线 | `klines` (UPSERT) |
| `sync_cn_quotes` | `35 15 * * *` | A股 (6位数字) | 批量拉报价 | `stock_quotes` + `quote_snapshots` |
| `sync_hk_quotes` | `35 16 * * *` | 港股 (≤5位数字) | 批量拉报价 | 同上 |
| `sync_us_quotes` | `35 4 * * *` | 美股 (其余) | 批量拉报价 | 同上 |
| `sync_us_fundamentals` | `0 5 * * *` | 仅美股 | 批量拉 PE/EPS/市值 | `stock_fundamentals` (UPSERT) |

### K线同步策略

- **只存日线**，周/月线由 SQL `date_trunc` 聚合派生
- **增量优先**：查本地最新日期 → `latest_date + 1d` 起拉，无新数据自然跳过
- **新股票**：本地无数据 → 从 `1990-01-01` 全量拉
- **控频**：每只股票间隔 2 秒，避免 yfinance 限流
- **启动自检**：`seed_if_empty()` 检测 klines 表为空则自动全量 seed（50 只一批）

### 数据表角色

| 表 | 类型 | 用途 |
|---|------|------|
| `stocks` | 目录 | 全量股票列表（手动导入） |
| `klines` | 时序 | 日线 K 线（周/月线 SQL 聚合派生） |
| `stock_quotes` | 快照 | 每只股票一行，最新报价 |
| `quote_snapshots` | 历史 | 每次刷新 append 一条，保留报价轨迹 |
| `stock_fundamentals` | 快照 | 每只股票一行，PE/PB/市值等（仅美股） |

### 市场判断规则

scheduler 通过 symbol 格式判断市场（与 AkShare 逻辑一致）：

```python
is_a_stock(s) → s.isdigit() and len(s) == 6     # 000001, 600519
is_hk_stock(s) → s.isdigit() and len(s) <= 5     # 0700
is_us_stock(s) → not (a or hk)                   # AAPL, 0700.HK
```

### 初始部署流程

1. `docker compose up -d postgres market-data` — 基础设施
2. 跑 migration：`pnpm --filter=@trading-agent/api db:migrate`
3. 导入 stocks：手动 SQL 写入 `stocks` 表
4. 启动 scheduler：`docker compose up -d scheduler`
   - 启动时自动检测 klines 为空 → 全量 seed K线
   - 之后每天按 cron 自动增量同步

## Dockerfile 模式

生产多阶段构建：build 阶段 `tsc` 编译，运行阶段只拷贝 `dist/` + `node_modules`。

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@latest
COPY .npmrc package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY api/business/package.json ./api/business/package.json
COPY shared/types/package.json ./shared/types/package.json
RUN pnpm install --filter=@trading-agent/api --frozen-lockfile
COPY shared/types ./shared/types
COPY api/business ./api/business
RUN pnpm --filter=@trading-agent/api exec tsc

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/api/business/dist ./dist
COPY --from=build /app/node_modules ./node_modules
CMD ["node", "dist/server.js"]
```

**单阶段就够了不要多阶段 install**——我们试过 production stage 重复 `pnpm install --prod`，symlink 全断。直接复用 build 阶段的 `node_modules`。

## 常见 Bug 速查

| 症状 | 根因 | 修复 |
|------|------|------|
| K 线图 2s+ 响应 | API 穿透 yfinance 或 TimescaleDB chunk 过多 | PG 直读，去掉 TimescaleDB |
| K 线只显示最早数据 | `ORDER BY ASC LIMIT 120` 拿的是最老的 120 条 | 子查询先 `DESC LIMIT` 再 `ASC` |
| 切换周/月线无变化 | API 只用 1d 查询 | `date_trunc` 按 interval 聚合 |
| load-more 无限循环 | `LogicalRange` 是索引不是时间戳 | `coordinateToTime()` 转换 |
| 缩放触发分页 | `fitContent()` 在每次 updateChart 调用 | 只在首次渲染调 `fitContent()` |
| Docker build 失败 | pnpm `approve-builds` 检查 | 加 `--ignore-scripts` |
| `--no-cache` 每次很久 | 不需要 | 只用 `docker compose build`，利用层缓存 |
