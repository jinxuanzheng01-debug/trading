# QuantMind 设计文档

> 版本：v1.0
> 日期：2026-05-26
> 定位：AI 原生投研 + 量化一体平台

---

## 一、产品定位

面向中国活跃投资者的 **AI 原生投研 + 量化一体平台**，核心理念：功能集成，从想法到执行的完整决策链。

### 三个核心能力

```
分析能力（多 Agent 投研辩论）
    +
量化能力（策略回测 + 历史 Pattern 验证）
    +
执行能力（模拟盘 + 行为分析）
    =
从想法到执行的完整决策链
```

---

## 二、目标用户

### Persona A：技术型散户（核心）

- **背景**：有 1-3 年 A 股/加密投资经验，会基本 Python 或愿意学
- **痛点**：分析工具分散（用多个 App 拼凑）；不知道如何验证投资逻辑；回测需要写很多代码
- **需求**：一个地方完成"想法 → 分析 → 回测 → 执行"
- **价值主张**：把原本需要 3 个工具才能完成的工作，在 QuantMind 里一站完成
- **对应功能**：研究站 + 量化工作台（全流程）

### Persona B：量化入门者（增长）

- **背景**：对量化感兴趣但不会写策略代码；可能有金融背景
- **痛点**：量化工具学习曲线陡峭；不知道从哪里开始
- **需求**：用自然语言描述想法，AI 帮生成策略并验证
- **价值主张**：零代码量化体验，AI 是副驾驶
- **对应功能**：NL→策略 + 策略模板库 + 可视化构建器

### Persona C：AI 投研爱好者（社区）

- **背景**：对 AI 如何分析股票感兴趣；关注 TradingAgents-CN 这类项目
- **痛点**：现有多 Agent 系统只输出结论，过程不可控；无法自定义 Agent 立场
- **需求**：可以自定义 Agent 辩论流程；看到完整推理过程
- **价值主张**：透明可解释的 AI 投研，可以 "debug" AI 的分析逻辑
- **对应功能**：Agent Prompt 编辑 + 辩论流程配置 + A/B 实验模式

---

## 三、系统架构

### 3.1 架构图

```
┌──────────────────────────────────────────────────────────────────┐
│                    Nuxt 4 :3000  (SSR + proxy)                    │
└───┬──────────────┬──────────────┬───────────────┬────────────────┘
    │              │              │               │
┌───▼────────┐ ┌──▼──────────────────────────┐ ┌──▼────────────┐
│ Hono API   │ │ VoltAgent :4001              │ │ Backtest      │
│ :4000      │ │ ┌──────────┐ ┌────────────┐ │ │ :8002         │
│ 业务逻辑    │ │ │ 内置Agent │ │ 外部Agent  │ │ │ 策略回测      │
│ 认证/用户   │ │ │ (TS)     │ │ (HTTP)    │ │ │ WF/MC/费用模型│
│ BullMQ调度  │ │ └──────────┘ └────────────┘ │ └──────┬────────┘
└──────┬─────┘ │ Agent编排 / Workflow / SSE   │        │
       │       └──────┬────────────────────────┘        │
       │              │                                  │
       │         ┌────▼─────────┐                        │
       │         │ LiteLLM      │                        │
       │         │ LLM 路由/降级 │                        │
       │         └──────────────┘                        │
       │              │                                  │
       │         ┌────▼──────────────────────────────────▼─┐
       │         │        Market Data :8000                 │
       │         │  数据聚合 + 缓存 + Fallback 链           │
       │         │  A股(AkShare) / 港美股(yfinance)         │
       │         │  加密(CCXT) / 宏观(FRED) / 新闻          │
       │         └─────────────────────────────────────────┘
       │
┌──────▼──────────────────────────────────────────────────────────┐
│               PostgreSQL + Redis + BullMQ 消息队列                │
└──────────────────────────────────────────────────────────────────┘
```

### 3.2 服务清单

| 服务 | 端口 | 语言 | 职责 |
|---|---|---|---|
| Nuxt 4 | 3000 | TypeScript | SSR 渲染 + server proxy 路由分发 |
| Hono API | 4000 | TypeScript | 业务逻辑 + 数据库操作 + BullMQ 入队 |
| VoltAgent | 4001 | TypeScript | Agent 编排（内置 Agent + 外部 Agent）+ Workflow + SSE |
| LiteLLM | 4000(内部) | Python | LLM 统一路由/降级/计费（Docker 官方镜像） |
| Market Data | 8000 | Python | 数据采集聚合 + Redis 缓存 + Fallback 链 |
| Backtest | 8002 | Python | 策略回测引擎（WF/MC/Bootstrap/费用模型） |
| Scheduler | 8001 | Python | 定时任务（报告生成/数据同步） |

基础设施：PostgreSQL 16 + Redis 7 + BullMQ（基于 Redis）

### 3.3 服务间通信

| 通信方式 | 场景 |
|---|---|
| HTTP（内部 Docker 网络） | VoltAgent → Market Data / Backtest |
| BullMQ 消息队列 | Hono API → VoltAgent（分析任务）/ Backtest（回测任务） |
| Redis Pub/Sub | VoltAgent → Nuxt（SSE 实时推送） |
| OpenAI 兼容协议 | VoltAgent → LiteLLM → 各 LLM 供应商 |
| MCP（P3） | 外部 AI 工具 → MCP Server → Market Data / Backtest |

### 3.4 VoltAgent 编排设计

VoltAgent 使用 `@voltagent/server-hono` + `@voltagent/core`，支持：

- **SubAgents + Supervisor**：多 Agent 协调
- **Workflow**：`createWorkflow` 编排 7 层 Pipeline
  - `andAgent`：Agent 步骤
  - `andDoWhile`：辩论循环
  - `andBranch`：条件分支
  - `andGuardrail`：合规检查
  - suspend/resume：用户暂停辩论插入观点
- **Memory**：LibSQL/PostgreSQL 适配器，跨会话记忆
- **SSE 流式输出**：`fullStreamEventForwarding`

### 3.5 外部 Agent 扩展

VoltAgent 通过 HTTP Tool 调用外部 LangChain Agent：

```typescript
const langchainTool = createTool({
  name: "macro_analysis",
  description: "宏观经济分析 Agent",
  parameters: z.object({ market: z.string() }),
  execute: async ({ market }) => {
    const res = await fetch(`http://langchain-agent:5000/analyze`, {
      method: "POST",
      body: JSON.stringify({ market })
    })
    return res.json()
  }
})
```

---

## 四、产品模块

### Module 1：研究站（Research Station）

#### 1.1 多 Agent 投研辩论（7 层 Pipeline）

```
用户输入：股票代码 + 分析深度（快速/标准/深度）
    │
    ▼
Layer 1：数据采集（并行，Agent Tools 调 Market Data）
    ├── 技术面 Agent：K线、均线、RSI、MACD、成交量
    ├── 基本面 Agent：财报、营收增速、PE/PB、机构持仓
    ├── 资金流 Agent：北向资金、龙虎榜、大宗交易（A 股）
    └── 情绪 Agent：新闻情绪、社交媒体、分析师评级
    │
    ▼
Layer 2：宏观门控（Macro Gate）
    当前 Regime 分类 → TRENDING / RANGING / RISK_OFF
    影响 Layer 3 的 Agent 立场权重
    │
    ▼
Layer 3：多空辩论（Bull ↔ Bear）
    快速=1轮 / 标准=3轮 / 深度=5轮
    支持用户 suspend 插入观点
    │
    ▼
Layer 4：历史 Pattern 校验
    12 个量化条件 → 匹配历史相似情境 → 胜率统计
    │
    ▼
Layer 5：交易员决策（Trader Agent）
    综合辩论 + Pattern → BUY/HOLD/SELL + 置信度
    │
    ▼
Layer 6：风险管理
    三种风格：激进 / 中立 / 保守
    │
    ▼
Layer 7：输出 + 合规
    最终建议 + 理由链 + 可追溯证据 + 免责声明
```

#### 1.2 历史 Pattern 匹配

12 个量化条件组：

| 条件类别 | 条件 | 说明 |
|---|---|---|
| 技术面 | RSI 区域 + 斜率 | 14日RSI绝对值 + 3日线性回归方向 |
| 技术面 | 趋势结构 | 价格 vs EMA9/EMA21 位置 |
| 技术面 | 价格动量 | 日涨跌幅 / ATR(14) 标准化 |
| 技术面 | 价格连续性 | 连续上涨/下跌天数 |
| 量能 | 相对成交量 | 今日量 / 20日均量 |
| 量能 | 量能连续性 | 连续放量/缩量天数 |
| 跳空 | 隔夜跳空 | 今日开盘 vs 昨日收盘 |
| 市场环境 | 大盘趋势 | 沪深 300 / BTC 相对均线状态 |
| 市场环境 | 波动率 | VIX（美股）/ DVOL（加密） |
| 宏观 | 宏观风险 | 利率曲线 + FRED 宏观综合评分 |
| 季节 | 月份 | 日历效应（年末/季末） |
| 基本面 | 财报临近 | 距下次财报天数 |

数据结构：`daily_condition_vectors` 表，每日预计算 12 维条件向量，匹配历史相似情境统计胜率。

#### 1.3 Agent 可定制能力（Persona C）

- **Agent Prompt 编辑**：用户可修改各 Agent 的系统提示词，自定义分析视角
- **辩论流程配置**：选择哪些 Agent 参与、辩论轮数、权重分配
- **A/B 实验模式**：同一股票用不同 Agent 配置跑两次，对比结论差异
- **Agent 准确率追踪**：复盘模块里按 Agent 维度统计历史命中率

#### 1.4 用户交互

- SSE 实时展示每层 Agent 输出，配色区分角色
- 支持暂停辩论、人工插入观点（VoltAgent suspend/resume）
- 分析结果自动保存，支持历史对比（同一股票不同时间）
- 导出：Markdown / PDF / 分享链接

---

### Module 2：市场中心（Market Hub）

#### 2.1 自选股 Watchlist

- 多分组管理
- 每只股票：价格 + 涨跌 + Sparkline + AI 信号颜色标记（BUY/HOLD/SELL）
- 一键触发快速分析（10s）

#### 2.2 投资组合视图

- 总持仓概览
- 行业分布 / 相关性分析 / 风险暴露
- 组合级别的 Regime 影响

#### 2.3 财报日历

- 未来 30 天 A 股/美股/港股财报日期
- 预期 EPS / 营收（分析师共识）
- 历史财报反应（发布后 3 日平均涨跌幅）
- 财报发布后自动触发 AI 摘要

#### 2.4 资金流监控（A 股特色）

- 北向资金日流向 + 趋势
- 龙虎榜异动
- 大宗交易折溢价

---

### Module 3：量化工作台（Strategy Studio）

#### 3.1 策略开发（双模式）

| 模式 | 用户类型 | 输入 | 输出 |
|---|---|---|---|
| **AI 创建** | 非技术用户 | 自然语言描述 | 完整策略代码 |
| **代码编辑器** | 技术用户 | 直接编写 Python | 完整策略代码 |
| **策略模板** | 量化入门者 | 选择模板 + 改参数 | 完整策略代码 |
| **可视化构建** | 零代码用户 | 表单/拖拽 | 完整策略代码 |

AI 创建流程：NL 描述 → LLM 生成代码 → Monaco Editor 预览修改 → 保存到策略库

#### 3.2 策略接口

```python
class IndicatorStrategy:
    """基于 DataFrame 的信号策略"""
    @abstractmethod
    def generate_signals(self, df: pd.DataFrame) -> pd.Series:
        """输出：1=买入, -1=卖出, 0=持有"""
        pass

class ScriptStrategy:
    """事件驱动策略"""
    @abstractmethod
    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Optional[Order]:
        pass
```

#### 3.3 回测引擎

- **A 股回测**：Point-in-Time 财报数据，防未来函数
- **港美股回测**：yfinance 历史数据
- **加密回测**：CCXT 历史数据，手续费/滑点模拟
- **费用模型**：A 股（印花税 0.1% + 佣金 0.03%）/ 加密（maker/taker + 滑点）

#### 3.4 回测验证层

```
回测结果
    ├─→ Walk-Forward 验证
    │   历史数据分 N 窗口，训练期参数优化 → 样本外验证
    │
    ├─→ Monte Carlo 置换检验
    │   随机打乱交易顺序 N 次（N=1000），计算 p-value
    │   p < 0.05 认为策略非随机
    │
    └─→ Bootstrap Sharpe CI
        有放回抽样 N 次计算 Sharpe 分布，95% 置信区间
```

#### 3.5 回测输出

- 收益曲线 / Sharpe / 最大回撤 / 胜率 / 盈亏比
- Benchmark 对比（沪深 300 / BTC）
- 每笔交易记录（可下钻查看触发原因）
- 参数敏感性热力图

#### 3.6 回测后 AI 分析

VoltAgent 自动分析回测结果，给出优化建议。

#### 3.7 Smart Tuning（两阶段）

1. 网格/随机扫描（无 LLM，确定性强）
2. AI 优化（LLM 分析回测结果 → 迭代推荐参数）

#### 3.8 策略自然语言解释

AI 用大白话解释策略逻辑："这个策略在 RSI 低于 30 时买入，涨 5% 卖出"

---

### Module 4：Alpha 实验室（Alpha Lab）

#### 4.1 Alpha 因子库

| 类别 | 因子示例 |
|---|---|
| 动量因子 | 过去 N 日收益率、涨跌连续性 |
| 反转因子 | 短期超买超卖、均值回归信号 |
| 量价因子 | 量价背离、主力资金净流入 |
| 基本面因子 | PEG、营收增速加速、ROE 趋势 |
| 情绪因子 | 分析师上调次数、内部人净买入 |
| 宏观因子 | 利率敏感度、大宗商品 Beta |

#### 4.2 AST 纯度检查

自动检测因子表达式中的未来函数（参考 Vibe-Trading）。

#### 4.3 因子评估

IC、IR、分层回测、因子相关性热力图。

#### 4.4 选股筛选器（Screener）

筛选维度：技术面 / 基本面 / 资金流 / AI 信号

展示：筛选结果 + 每只股票一句 AI 摘要

---

### Module 5：宏观雷达（Macro Radar）

- 全球宏观指标实时看板（VIX、美债收益率、美元指数、大宗商品）
- 当前 Regime 判断（TRENDING/RANGING/RISK_OFF）+ 历史 Regime 占比
- Regime 对不同资产历史表现的影响

---

### Module 6：报告与复盘（Reports & Review）

#### 6.1 报告系统

| 报告类型 | 频率 | 内容 |
|---|---|---|
| 日报 | 每日自动 | 大盘概览 + 自选异动 + AI 信号 + 明日关注 |
| 异动报 | 实时触发 | 价格突破 / 成交量异动 / 资金流大额变动 |
| 周报 | 每周日自动 | 操作回顾 + 盈亏 + AI 命中率 |
| 月报 | 每月末自动 | 收益归因 + 策略健康度 + 行为偏差 + 假设验证 |
| 复盘报告 | 手动触发 | 特定交易/时段深度回顾 |

#### 6.2 复盘系统

- **AI 分析准确率追踪**：回溯历史 AI 结论 vs 实际走势
- **交易决策回顾**：每笔交易关联触发时的 AI 分析，盈亏归因
- **策略健康度监控**：近期表现 vs 回测预期，偏离告警
- **Agent 准确率追踪**：按 Agent 维度统计命中率

#### 6.3 生成方式

- 日报/周报/月报：Scheduler 定时触发 → VoltAgent 生成 → 推送
- 异动报：Market Data 检测阈值 → BullMQ 入队 → Agent 生成
- 复盘报告：用户选择标的/时段 → Agent 调历史分析 + 实际走势

---

### Module 7：执行层（Trade）

#### 7.1 模拟盘

- 100 万虚拟资金
- 持仓 / 盈亏 / 操作日志
- 策略可直连模拟盘执行

#### 7.2 交易行为分析（Shadow Account）

- 上传券商导出（同花顺/东方财富 CSV）
- AI 分析行为偏差：胜率 / 持仓偏差 / 处置效应 / 过度交易
- 对比"按规则执行"的模拟结果
- 行为偏差报告

---

### Module 8：记忆与假设（Memory & Hypothesis）

#### 8.1 研究假设管理

- 创建持久化投资假设："我认为 XX 在加息周期末期会反弹"
- 每次相关分析自动关联到假设
- 证据/反证追踪

#### 8.2 跨会话记忆

- Agent 分析结果自动存储
- FTS5 全文检索历史分析
- "上次分析宁德时代是什么结论？" → 自动召回

---

### Module 9：策略市场 — P3

- 策略作者发布策略 → 用户订阅/购买 → 平台抽成 20%
- 策略评分 + 回测验证透明化

### Module 10：MCP 集成 — P3

- MCP Server 暴露 Tools（行情/分析/回测）
- 外部 AI 工具（Claude Desktop / Cursor）可调用平台能力

---

## 五、完整功能优先级表

### P0（核心体验，26 项）

| # | 功能 | 模块 | 用户价值 | 开发难度 |
|---|---|---|---|---|
| 1 | 多 Agent 投研辩论（7 层 Pipeline） | 研究站 | ★★★★★ | ★★★ |
| 2 | Layer 1 数据采集（技术面/基本面/资金流/情绪 并行） | 研究站 | ★★★★★ | ★★★ |
| 3 | Layer 2 宏观门控（Regime 分类） | 研究站 | ★★★★ | ★★ |
| 4 | Layer 3 多空辩论（Bull ↔ Bear） | 研究站 | ★★★★★ | ★★★ |
| 5 | Layer 5 交易员决策（BUY/HOLD/SELL + 置信度） | 研究站 | ★★★★★ | ★★ |
| 6 | Layer 6 风险管理（激进/中立/保守） | 研究站 | ★★★★ | ★★ |
| 7 | Layer 7 输出 + 合规免责声明 | 研究站 | ★★★★ | ★ |
| 8 | 实时流式输出（SSE） | 研究站 | ★★★★★ | ★★ |
| 9 | Agent 输出配色区分角色 | 研究站 | ★★★★ | ★★ |
| 10 | 用户暂停辩论 + 人工插入观点 | 研究站 | ★★★★ | ★★ |
| 11 | 分析结果自动保存 + 历史对比 | 研究站 | ★★★★ | ★★ |
| 12 | 自选股 Watchlist | 市场中心 | ★★★★ | ★ |
| 13 | 自选股 AI 信号聚合 | 市场中心 | ★★★★ | ★ |
| 14 | 一键快速分析 | 市场中心 | ★★★★ | ★ |
| 15 | 资金流监控 | 市场中心 | ★★★★ | ★★ |
| 16 | 回测引擎（A 股/港美股/加密） | 量化工作台 | ★★★★★ | ★★★ |
| 17 | Walk-Forward 验证 | 量化工作台 | ★★★★ | ★★★ |
| 18 | Monte Carlo 置换检验 | 量化工作台 | ★★★★ | ★★★ |
| 19 | Bootstrap Sharpe CI | 量化工作台 | ★★★ | ★★ |
| 20 | 费用模型 | 量化工作台 | ★★★★ | ★★ |
| 21 | Point-in-Time 防未来函数 | 量化工作台 | ★★★★★ | ★★★ |
| 22 | 策略接口（IndicatorStrategy + ScriptStrategy） | 量化工作台 | ★★★★ | ★★ |
| 23 | 回测输出（收益曲线/Sharpe/MDD/胜率/盈亏比） | 量化工作台 | ★★★★★ | ★★ |
| 24 | 每笔交易记录可下钻 | 量化工作台 | ★★★★ | ★★ |
| 25 | 认证系统（JWT） | 基础 | ★★★★★ | ★★ |
| 26 | 用户管理（角色） | 基础 | ★★★ | ★ |

### P1（增长体验，29 项）

| # | 功能 | 模块 | 用户价值 | 开发难度 |
|---|---|---|---|---|
| 27 | AI 创建策略（NL→代码） | 量化工作台 | ★★★★ | ★★★ |
| 28 | NL→策略 Prompt 模板 | 量化工作台 | ★★★★ | ★★ |
| 29 | 在线代码编辑器（Monaco Editor） | 量化工作台 | ★★★★ | ★★ |
| 30 | 回测后 AI 分析 | 量化工作台 | ★★★★ | ★★ |
| 31 | 历史 Pattern 匹配（12 条件） | 研究站 | ★★★★ | ★★★ |
| 32 | Pattern 条件向量表 | 研究站 | ★★★★ | ★★ |
| 33 | 财报日历 | 市场中心 | ★★★ | ★★ |
| 34 | 财报后自动 AI 摘要 | 市场中心 | ★★★ | ★★ |
| 35 | 选股筛选器 | Alpha 实验室 | ★★★★ | ★★ |
| 36 | 筛选结果 AI 摘要 | Alpha 实验室 | ★★★★ | ★ |
| 37 | 宏观 Radar 看板 | 宏观雷达 | ★★★ | ★★ |
| 38 | Regime 判断 + 历史 Regime 占比 | 宏观雷达 | ★★★★ | ★★ |
| 39 | Regime 对资产历史影响 | 宏观雷达 | ★★★ | ★★ |
| 40 | 复盘 — AI 分析准确率追踪 | 报告与复盘 | ★★★★★ | ★★ |
| 41 | 复盘 — 交易决策回顾 | 报告与复盘 | ★★★★ | ★★ |
| 42 | 复盘 — 策略健康度监控 | 报告与复盘 | ★★★★ | ★★ |
| 43 | 复盘 — 周/月复盘报告 | 报告与复盘 | ★★★★ | ★★ |
| 44 | 日报 | 报告与复盘 | ★★★★ | ★★ |
| 45 | 异动报 | 报告与复盘 | ★★★★ | ★★ |
| 46 | 周报 | 报告与复盘 | ★★★ | ★★ |
| 47 | 月报 | 报告与复盘 | ★★★ | ★★ |
| 48 | 策略模板库 | 量化工作台 | ★★★★ | ★★ |
| 49 | 策略自然语言解释 | 量化工作台 | ★★★★ | ★ |
| 50 | Agent Prompt 编辑 | 研究站 | ★★★★ | ★★ |
| 51 | Agent 准确率追踪 | 报告与复盘 | ★★★★ | ★★ |
| 52 | 投资组合视图 | 市场中心 | ★★★★ | ★★ |
| 53 | 通知/告警系统 | 基础 | ★★★★ | ★★ |
| 54 | 导出（Markdown/PDF/分享） | 研究站 | ★★★ | ★★ |
| 55 | 数据 Fallback 链 | 基础 | ★★★★ | ★★ |

### P2（深度体验，24 项）

| # | 功能 | 模块 | 用户价值 | 开发难度 |
|---|---|---|---|---|
| 56 | 交易行为分析 Shadow Account | 执行层 | ★★★ | ★★★ |
| 57 | 处置效应/过度交易/持仓偏差分析 | 执行层 | ★★★ | ★★ |
| 58 | 对比"按规则执行"模拟结果 | 执行层 | ★★★ | ★★ |
| 59 | Alpha 因子库 — 动量因子 | Alpha 实验室 | ★★★ | ★★★ |
| 60 | Alpha 因子库 — 反转因子 | Alpha 实验室 | ★★★ | ★★ |
| 61 | Alpha 因子库 — 量价因子 | Alpha 实验室 | ★★★ | ★★ |
| 62 | Alpha 因子库 — 基本面因子 | Alpha 实验室 | ★★★ | ★★★ |
| 63 | Alpha 因子库 — 情绪因子 | Alpha 实验室 | ★★★ | ★★ |
| 64 | Alpha 因子库 — 宏观因子 | Alpha 实验室 | ★★★ | ★★ |
| 65 | AST 纯度检查 | Alpha 实验室 | ★★★★ | ★★★ |
| 66 | 因子评估（IC/IR/分层回测/相关性热力图） | Alpha 实验室 | ★★★★ | ★★★ |
| 67 | 模拟盘交易 | 执行层 | ★★★ | ★★ |
| 68 | 策略直连模拟盘 | 执行层 | ★★★★ | ★★ |
| 69 | Smart Tuning — 网格/随机扫描 | 量化工作台 | ★★★ | ★★ |
| 70 | Smart Tuning — AI 优化 | 量化工作台 | ★★★ | ★★ |
| 71 | 参数敏感性热力图 | 量化工作台 | ★★★★ | ★★ |
| 72 | 研究假设管理 | 记忆与假设 | ★★★ | ★★ |
| 73 | 假设证据/反证自动关联 | 记忆与假设 | ★★★ | ★★ |
| 74 | 跨会话记忆（FTS5） | 记忆与假设 | ★★★★ | ★★ |
| 75 | 可视化策略构建器 | 量化工作台 | ★★★ | ★★★ |
| 76 | 辩论流程配置 | 研究站 | ★★★ | ★★ |
| 77 | A/B 实验模式 | 研究站 | ★★★ | ★★ |
| 78 | 仪表盘自定义 | 基础 | ★★★ | ★★ |
| 79 | 行为偏差报告 | 执行层 | ★★★ | ★★ |

### P3（生态与扩展，4 项）

| # | 功能 | 模块 | 用户价值 | 开发难度 |
|---|---|---|---|---|
| 80 | 策略市场（发布/购买/评分/抽成） | 策略市场 | ★★★ | ★★★★★ |
| 81 | 策略评分 + 回测验证透明化 | 策略市场 | ★★★ | ★★★ |
| 82 | MCP Server | MCP | ★★★ | ★★★ |
| 83 | 外部工具调用 | MCP | ★★★ | ★★ |

### 基础设施（非功能，8 项）

| # | 功能 | 说明 |
|---|---|---|
| 84 | 安全设计 | API Key AES-256 加密、限流按 tier 分 |
| 85 | 监控与可观测性 | Prometheus + Grafana + LiteLLM 成本追踪 |
| 86 | Agent 审计日志 | 每次分析完整 prompt + response + token 消耗 |
| 87 | 代理支持 | HTTP_PROXY / NO_PROXY（中国网络环境） |
| 88 | LLM 供应商配置 | DeepSeek V3 默认 → Qwen 降级，R1 推理 |
| 89 | Docker Compose 部署 | 7 个服务编排 |
| 90 | 数据库表结构 | users/analysis_runs/strategies/backtest_runs/hypotheses/watchlists/paper_portfolios/daily_condition_vectors |
| 91 | 全文检索索引 | PostgreSQL FTS / pgvector |

---

## 六、技术栈详情

### 6.1 技术选型

| 层次 | 选型 | 选择理由 |
|---|---|---|
| 前端 | Nuxt 4 + Vue 3 + shadcn-vue + TailwindCSS 4 | 已有基础，SSR 支持 |
| BFF/API | Hono (Node.js) + Drizzle ORM | 已有基础，轻量高性能 |
| Agent 编排 | VoltAgent + @voltagent/server-hono | TS 原生，Hono 集成，Workflow + SubAgents |
| LLM 路由 | LiteLLM（Docker 镜像） | 统一 100+ 供应商，自动降级，成本追踪 |
| 数据服务 | FastAPI + Python | 量化生态天然兼容 |
| 回测引擎 | FastAPI + pandas + numpy + TA-Lib | Python 量化标准栈 |
| 数据库 | PostgreSQL 16 | JSONB + FTS + pgvector |
| 缓存/消息 | Redis 7 + BullMQ | 行情缓存 + 任务队列 |
| 数据源-A股 | AkShare（主）/ Tushare Pro（辅） | 免费覆盖面广 |
| 数据源-港美股 | yfinance + AkShare | 免费 |
| 数据源-加密 | CCXT | 统一接口，100+ 交易所 |
| 数据源-宏观 | FRED API + AkShare 宏观 | 免费高质量 |
| 容器化 | Docker Compose | MVP 阶段单机足够 |

### 6.2 LLM 供应商优先级

```
默认（中国用户）：DeepSeek V3 → Qwen-Max → Kimi-k1.5
推理任务：      DeepSeek R1 → Qwen-QwQ
备用（全球）：  Claude 3.7 → GPT-4o → Gemini 2.0 Flash
本地部署：      Ollama（llama3.3 / Qwen2.5 72B）
切换方式：      LiteLLM config.yaml
```

### 6.3 消息队列接口抽象

```typescript
interface MessageQueue {
  publish(topic: string, payload: unknown): Promise<string>
  subscribe(topic: string, handler: (msg: Message) => Promise<void>): void
  acknowledge(msgId: string): Promise<void>
}
```

当前实现：BullMQ（基于 Redis）。后期可按需迁移 RocketMQ，只需实现新 Adapter。

---

## 七、数据库核心表

```sql
-- 用户
users (id, email, tier, created_at)

-- 分析历史
analysis_runs (id, user_id, ticker, market, depth, status, result JSONB, layer_outputs JSONB, llm_provider, created_at, completed_at)

-- 策略库
strategies (id, user_id, name, type, code TEXT, params JSONB, created_at)

-- 回测结果
backtest_runs (id, strategy_id, user_id, config JSONB, metrics JSONB, equity_curve JSONB, trades JSONB, wf_results JSONB, mc_pvalue FLOAT, created_at)

-- 投资假设
hypotheses (id, user_id, title, body TEXT, status, evidence JSONB, counter_evidence JSONB, linked_analysis_ids UUID[], created_at, updated_at)

-- 自选股
watchlist_groups (id, user_id, name, created_at)
watchlist_items (id, group_id, ticker, market, note, created_at)

-- 模拟盘
paper_portfolios (id, user_id, cash, positions JSONB, trade_log JSONB, created_at)

-- Pattern 条件向量
daily_condition_vectors (id, ticker, date, market, rsi_zone, rsi_slope, trend_struct, price_momentum, price_streak, rel_volume, vol_streak, overnight_gap, market_trend, volatility, macro_risk, earnings_proximity, next_1d_return, next_5d_return, next_20d_return)

-- 全文检索索引
CREATE INDEX idx_analysis_fts ON analysis_runs USING GIN(to_tsvector('simple', result::text));
```

---

## 八、安全与合规

- 所有 AI 输出附带免责声明
- Agent 不能自动执行实盘交易
- 用户数据本地可导出
- API 限流按 tier 分配（free: 3次分析/天, pro: 无限）
- 凭证 AES-256 加密存储
- 中国网络环境代理支持

---

## 九、非功能需求

### 性能

- 多 Agent 完整分析（标准模式）：< 90s
- 快速分析（Watchlist 触发）：< 15s
- 回测（1年数据，日频）：< 10s
- Screener 扫描（全 A 股）：< 5s

### 数据延迟

- A 股数据延迟：< 15 分钟（免费数据源限制）
- 加密数据延迟：< 1 分钟（WebSocket 实时）
- 财报数据：T+0

### 可用性

- 支持国产 LLM（DeepSeek/Qwen/Kimi）作为默认
- 支持代理设置（中国网络环境）
- 移动端可访问（响应式 Web）
