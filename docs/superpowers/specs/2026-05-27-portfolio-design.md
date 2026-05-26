# 多钱包（模拟账户）设计文档

**日期**: 2026-05-27
**版本**: v1.0
**状态**: 设计中

## 1. 概述

多钱包系统允许用户创建多个模拟账户，每个账户可设置不同初始资金、录入持仓、配置策略、跑回测并监控收益。核心能力：仓位管理 + 策略回测 + 绩效追踪。

## 2. 数据库设计

### 2.1 portfolios — 账户表

```sql
CREATE TABLE portfolios (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  initial_capital DECIMAL(16,2) NOT NULL DEFAULT 0,
  cash_balance DECIMAL(16,2) NOT NULL DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 portfolio_holdings — 持仓表

```sql
CREATE TABLE portfolio_holdings (
  id SERIAL PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  stock_id INTEGER NOT NULL REFERENCES stocks(id),
  quantity DECIMAL(16,6) NOT NULL,
  avg_cost DECIMAL(12,4) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (portfolio_id, stock_id)
);
```

### 2.3 portfolio_transactions — 交易记录

```sql
CREATE TABLE portfolio_transactions (
  id SERIAL PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  stock_id INTEGER NOT NULL REFERENCES stocks(id),
  type VARCHAR(10) NOT NULL CHECK (type IN ('BUY', 'SELL')),
  quantity DECIMAL(16,6) NOT NULL,
  price DECIMAL(12,4) NOT NULL,
  total DECIMAL(16,2) NOT NULL,
  fee DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  traded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2.4 portfolio_snapshots — 每日快照（净值曲线）

```sql
CREATE TABLE portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  total_value DECIMAL(16,2) NOT NULL,
  cash DECIMAL(16,2) NOT NULL,
  positions_value DECIMAL(16,2) NOT NULL,
  pnl DECIMAL(16,2),
  pnl_percent DECIMAL(8,4),
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (portfolio_id, snapshot_date)
);
```

### 2.5 扩展 backtest_runs

已存在的 `backtest_runs` 表新增 `portfolio_id` 字段：

```sql
ALTER TABLE backtest_runs ADD COLUMN portfolio_id INTEGER REFERENCES portfolios(id);
```

### 2.6 ER 关系

```
users
  └── portfolios (user_id)
        ├── portfolio_holdings (portfolio_id, stock_id)
        ├── portfolio_transactions (portfolio_id, stock_id)
        ├── portfolio_snapshots (portfolio_id)
        └── backtest_runs (portfolio_id)
```

## 3. API 设计

### 3.1 账户管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/portfolios | 获取所有账户列表 |
| POST | /api/portfolios | 创建账户 |
| PUT | /api/portfolios/:id | 更新账户信息 |
| DELETE | /api/portfolios/:id | 删除账户及关联数据 |

### 3.2 持仓管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/portfolios/:id/holdings | 获取持仓（JOIN stocks 获取行情） |
| POST | /api/portfolios/:id/holdings | 添加持仓（手动录入） |
| PUT | /api/portfolios/:id/holdings/:hid | 更新持仓数量/成本 |
| DELETE | /api/portfolios/:id/holdings/:hid | 删除持仓 |

### 3.3 交易记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/portfolios/:id/transactions | 获取交易记录 |
| POST | /api/portfolios/:id/transactions | 新增交易（买入/卖出） |

交易会自动更新持仓和现金余额：
- BUY: cash_balance -= total, holding upsert
- SELL: cash_balance += total, holding quantity 减少

### 3.4 绩效概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/portfolios/:id/summary | 总资产/持仓市值/现金/总盈亏/收益率 |
| GET | /api/portfolios/:id/snapshots | 净值曲线（每日快照） |

### 3.5 账户创建请求

```json
{
  "name": "我的实盘",
  "description": "美股长期持有",
  "initial_capital": 100000,
  "cash_balance": 35000,
  "currency": "USD"
}
```

### 3.6 持仓录入请求

```json
{
  "symbol": "AAPL",
  "quantity": 100,
  "avg_cost": 280.50
}
```

## 4. 前端页面

### 4.1 页面结构

```
pages/portfolio/index.vue           — 账户列表
pages/portfolio/[id].vue            — 账户详情

components/portfolio/
├── PortfolioCard.vue               — 账户卡片（总资产/收益率）
├── PortfolioHoldingTable.vue       — 持仓表格
├── PortfolioPerformance.vue        — 收益曲线
├── PortfolioTransactions.vue       — 交易历史
└── PortfolioBacktest.vue           — 回测配置和执行
```

### 4.2 账户列表页

```
┌──────────────────────────────────────────────┐
│  [+ 新建账户]                                 │
├──────────────────────────────────────────────┤
│  ┌─────────────────────────┐                 │
│  │ 我的实盘                  │                 │
│  │ 总资产 $142,350          │                 │
│  │ 收益 +$42,350 (+42.35%)   │                 │
│  │ 持仓 5只  现金 $35,000    │                 │
│  └─────────────────────────┘                 │
│  ┌─────────────────────────┐                 │
│  │ 网格策略测试              │                 │
│  │ 总资产 $58,200           │                 │
│  │ 收益 -$1,800 (-3.00%)    │                 │
│  │ 持仓 3只  现金 $12,000   │                 │
│  └─────────────────────────┘                 │
└──────────────────────────────────────────────┘
```

### 4.3 账户详情页

```
┌──────────────────────────────────────────────┐
│  ← 返回    我的实盘    [编辑] [删除]          │
├──────────────────────────────────────────────┤
│  总资产         持仓市值        现金          │
│  $142,350       $107,350       $35,000       │
│  总盈亏         收益率         持仓数         │
│  +$42,350       +42.35%        5只           │
├──────────────────────────────────────────────┤
│  净值曲线 (portfolio_snapshots)               │
│  ┌─────────────────────────────────────┐     │
│  │         📈 收益率走势图              │     │
│  └─────────────────────────────────────┘     │
├──────────────────────────────────────────────┤
│  持仓                                        │
│  股票      数量    成本     现价    盈亏      │
│  AAPL      100    280.50   310.12  +2,962   │
│  TSLA      50     380.00   432.05  +2,602   │
├──────────────────────────────────────────────┤
│  [持仓] [交易记录] [回测]                     │
└──────────────────────────────────────────────┘
```

## 5. 策略回测集成

### 5.1 复用现有 backtest_runs 表

创建回测时关联 portfolio_id，使用 portfolio 的初始资金和持仓作为起点。

### 5.2 回测配置

```json
{
  "portfolio_id": 1,
  "strategy_name": "网格交易",
  "strategy_code": "...",
  "strategy_type": "grid",
  "config": {
    "grid_size": 0.05,
    "grid_count": 10,
    "base_price": 310.00
  }
}
```

### 5.3 回测流程

```
1. 选择账户 + 策略
2. 配置策略参数
3. 提交回测任务 → backtest 服务执行
4. 轮询结果 → 显示 metrics/equity_curve/trades
```

## 6. 每日快照生成

Scheduler 新增任务，每天收盘后为所有活跃账户生成快照：

```
1. 遍历所有 portfolio_holdings
2. 从 market-data 获取持仓股票最新价
3. 计算 total_value = cash + sum(quantity * price)
4. 计算 pnl = total_value - initial_capital
5. INSERT INTO portfolio_snapshots
```

## 7. 实施顺序

| 优先级 | 模块 | 说明 |
|--------|------|------|
| P0 | portfolios 表 + CRUD API | 账户基础管理 |
| P0 | 账户列表页 + 详情页 | 前端展示 |
| P1 | 持仓管理 + 手动录入 | 录入现有持仓 |
| P1 | 交易记录 + 现金自动计算 | 买卖更新持仓 |
| P1 | 净值快照 + 收益曲线 | 绩效可视化 |
| P2 | 策略回测集成 | 关联 backtest |
| P2 | 自动快照定时任务 | 每日净值 |
