# 多钱包纸面交易（Paper Trading）设计规格

## 概述

参考 TradingAgents-CN 的 Paper Trading 模块，为 Trading-agent 添加多钱包纸面交易功能。用户创建虚拟钱包（"富途A股"、"IB美股"等），用虚拟资金进行模拟买卖、追踪持仓盈亏，并可对持仓发起 AI 分析。

### 核心差异 vs TradingAgents-CN

| 维度 | TradingAgents-CN | 本项目 |
|------|-----------------|--------|
| 账户模型 | 单账户/用户 | 多钱包/用户 |
| 市场隔离 | 单账户内按货币分区 | 每个钱包独立市场+货币 |
| 数据库 | MongoDB | PostgreSQL + Drizzle ORM |

---

## 数据模型

### paper_wallets（钱包）

```sql
CREATE TABLE paper_wallets (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,           -- "富途A股"
  market          VARCHAR(10) NOT NULL,            -- CN / HK / US
  currency        VARCHAR(10) NOT NULL,            -- CNY / HKD / USD
  initial_balance NUMERIC(18,2) NOT NULL,          -- 初始资金
  cash            NUMERIC(18,2) NOT NULL,          -- 当前可用现金
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW()
);
```

### paper_positions（持仓）

```sql
CREATE TABLE paper_positions (
  id              SERIAL PRIMARY KEY,
  wallet_id       INTEGER NOT NULL REFERENCES paper_wallets(id) ON DELETE CASCADE,
  stock_code      VARCHAR(20) NOT NULL,            -- 000001 / AAPL
  stock_name      VARCHAR(200),                    -- 从 market-data 自动获取
  market          VARCHAR(10) NOT NULL,            -- CN / HK / US
  quantity        NUMERIC(18,4) NOT NULL,          -- 持仓数量
  avg_cost        NUMERIC(18,4) NOT NULL,          -- 加权均价
  created_at      TIMESTAMP DEFAULT NOW(),
  updated_at      TIMESTAMP DEFAULT NOW(),
  UNIQUE(wallet_id, stock_code)
);
```

### paper_orders（订单流水）

```sql
CREATE TABLE paper_orders (
  id              SERIAL PRIMARY KEY,
  wallet_id       INTEGER NOT NULL REFERENCES paper_wallets(id) ON DELETE CASCADE,
  stock_code      VARCHAR(20) NOT NULL,
  stock_name      VARCHAR(200),
  side            VARCHAR(10) NOT NULL,            -- buy / sell
  quantity        NUMERIC(18,4) NOT NULL,
  price           NUMERIC(18,4) NOT NULL,          -- 成交价
  amount          NUMERIC(18,2) NOT NULL,          -- 成交金额
  fee             NUMERIC(18,2) DEFAULT 0,         -- 手续费（暂为0）
  status          VARCHAR(20) NOT NULL DEFAULT 'filled', -- filled / cancelled
  filled_at       TIMESTAMP DEFAULT NOW(),
  created_at      TIMESTAMP DEFAULT NOW()
);
```

---

## API 设计

所有接口前缀 `/api/paper`，需要 JWT 认证。

### 钱包管理

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/paper/wallets` | 创建钱包 `{ name, market, initial_balance }` |
| GET | `/api/paper/wallets` | 钱包列表，每项含总资产/总盈亏 |
| GET | `/api/paper/wallets/:id` | 钱包详情（可用现金/持仓市值/总资产/已实现盈亏） |
| DELETE | `/api/paper/wallets/:id` | 删除钱包（级联删除持仓和订单） |
| POST | `/api/paper/wallets/:id/reset` | 重置钱包（现金归 initial_balance，清空持仓和订单） |

### 下单

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/paper/wallets/:id/orders` | 市价下单 `{ stock_code, side, quantity }` |

下单逻辑：
1. 校验钱包存在且属于当前用户
2. 调用 market-data 服务 `GET /api/quote?symbol=XXX` 取最新成交价
3. 买入：校验现金 >= 数量 × 单价，扣现金，加权均价更新持仓
4. 卖出：校验持仓数量 >= 卖出数量，加现金，减持仓
5. 买入加权均价: `new_avg_cost = (old_qty × old_avg_cost + buy_qty × fill_price) / (old_qty + buy_qty)`
6. 写入 paper_orders，返回成交结果 `{ order, position, wallet }`

### 持仓

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/paper/wallets/:id/positions` | 持仓列表，每项含实时价/浮盈 |
| POST | `/api/paper/wallets/:id/positions` | 手动录入持仓 `{ stock_code, quantity, avg_cost }` |

持仓列表获取时，并发调用 market-data 服务计算实时浮盈（latest_price - avg_cost）× quantity。

手动录入不走订单流水、不扣现金，直接建仓。适用于用户从外部券商导入已有持仓的场景。

### 订单记录

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/paper/wallets/:id/orders` | 订单流水，支持 `?limit=` |

---

## 前端页面

### /paper — 钱包管理页

```
┌─────────────────────────────────────────────┐
│ 💰 我的纸面交易              [+ 创建钱包]    │
├─────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│ │ 富途A股   │  │ IB美股    │  │ 富途港股  │    │
│ │ 🇨🇳 CNY   │  │ 🇺🇸 USD   │  │ 🇭🇰 HKD   │    │
│ │ 总 ¥1.2万 │  │ 总 $5.8万 │  │ 总 HK$3万 │    │
│ │ +3.2% ↑  │  │ -1.5% ↓  │  │ +0.8% ↑  │    │
│ └──────────┘  └──────────┘  └──────────┘    │
└─────────────────────────────────────────────┘
```

### /paper/:id — 钱包详情页

```
┌─────────────────────────────────────────────┐
│ 富途A股 (CNY)              [重置] [下单]    │
├─────────────────────────────────────────────┤
│ 可用资金 ¥80,000 | 持仓市值 ¥120,000         │
│ 总资产 ¥200,000 | 已实现盈亏 +¥5,200        │
├─────────────────────────────────────────────┤
│ 持仓 (3)                                   │
│ ┌─────────────────────────────────────────┐ │
│ │ 代码   名称  数量  均价   最新价  浮盈    │ │
│ │ 000001 平安  1000  ¥12.5  ¥13.2  +¥700  │ │
│ │ 600519 茅台  10    ¥1650  ¥1680  +¥300  │ │
│ │ [详情] [分析] [卖出]                     │ │
│ └─────────────────────────────────────────┘ │
├─────────────────────────────────────────────┤
│ 订单记录                                   │
│ 时间 | 方向 | 代码 | 价格 | 数量 | 状态    │
│ 05-28 买入 000001 ¥12.5 1000 已成交       │
└─────────────────────────────────────────────┘
```

### 下单弹窗（组件）

- 买入/卖出 Radio 切换
- 股票代码输入（调 market-data 自动获取名称和实时价）
- 市场自动识别（A股 6 位数字、港股 4-5 位、美股字母）
- 数量输入，自动计算预估金额
- 确认下单

### Dashboard 集成

在 Dashboard 页面新增"资产概览"卡片：汇总所有钱包的总资产、总盈亏。

---

## 与现有模块衔接

| 衔接点 | 方式 |
|--------|------|
| market-data 服务 | 下单取成交价、持仓列表取实时价（`GET /api/quote`） |
| 研究分析 | 持仓行"分析"按钮 → `/research?ticker=XXX&market=XXX` |
| 股票详情 | 代码点击 → `/stock/XXX` |
| 侧边栏菜单 | 新增"纸面交易"菜单项，icon CreditCard |

---

## 接口边界

- Paper Trading 模块**只做展示和下单**，不负责行情数据的获取/存储
- 行情数据通过 market-data 服务的 `GET /api/quote` 实时获取
- 不持有定时任务——净值快照等功能后续加
- 只做市价单，订单表预留 `order_type` / `limit_price` 字段供后续扩展

---

## V1 不做

- 限价单
- 策略自动执行
- 净值曲线 / 每日快照
- 手续费计算（字段预留，值填 0）
- 批量导入持仓
