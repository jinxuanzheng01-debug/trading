# 技术面分析功能设计文档

> 日期：2026-05-30
> 状态：已确认，待实施
> 版本：V1 设计 + 完整 Roadmap

---

## 一、背景与目标

### 1.1 项目现状

Trading Agent 是一个量化分析平台，已完成：
- 用户认证系统
- 自选分组 + 标的管理
- 股票详情页 + K线图（ECharts）
- Paper Trading 模拟交易
- 行情数据同步（market-data 服务，已支持 RSI/MACD/EMA/KDJ/BOLL/MA）
- AI 分析流程骨架（agent 服务 + BullMQ worker + SSE 流式推送 + 前端 research 页面）

现有 AI 分析的不足：agent 服务使用 VoltAgent + DeepSeek，让 LLM 直接调用指标 API 做"分析"——本质上是 LLM 看指标数值后猜测结论，存在幻觉风险，且无法做真正的量化因子计算。

### 1.2 设计目标

用工程化计算取代 LLM 直接分析指标数值的模式：
- **技术指标和因子计算完全由 Python 算法完成**（TA-Lib + 标准算子），零幻觉
- **LLM 只做最后一步的自然语言解读**（总结 + 风险提示）
- 构建可扩展的因子/信号/策略体系，为后续版本（截面因子、回测、缠论等）打好基础

### 1.3 调研参考

| 项目 | 核心借鉴 |
|------|---------|
| **Vibe-Trading** (HKUDS, 8.6k ⭐) | Alpha Zoo 架构：19 个标准算子 + 因子注册表 + AST 纯度门 + SignalEngine 投票机制 + 452 个预置因子 |
| **TradeOdds** | 17 维条件指纹匹配：因子离散化为 bucket，历史精确匹配，输出概率分布而非评分 |
| **CryptoQuant AI** | 市场状态门控：Regime(Trending/Mean-Reverting/Risk-Off) 决定策略路由和 TP/SL 参数 |
| **TradingAgents-CN** | 多 Agent 辩论：多空双方各持立场，通过 LangGraph 编排进行多轮辩论 |
| **QuantDinger** | 5 层引擎：指标 → 信号 → 策略 → 回测 → AI 分析，`@strategy` 注解模式 |
| **Daily Stock Analysis** | 15 种策略 + LLM 评分后处理 pipeline（normalize + stabilize + placeholder detection） |
| **chan.py** | 缠论完整实现：分型 → 笔 → 线段 → 中枢 → 买卖点，支持多级别联立 |
| **ta-lib-python** | 行业标准：200+ 指标，61 个 K线形态识别，C 核心性能最优 |

---

## 二、架构决策

### 2.1 方案选择

经过对比三个方案，选择 **方案 A：独立 Python 技术分析微服务**：

| 方案 | 描述 | 结论 |
|------|------|------|
| **A. 新建 ta-engine 微服务** ✅ | FastAPI + TA-Lib，独立服务端口 8003 | 职责清晰、Python 量化生态最丰富、可扩展 |
| B. 扩展 market-data 服务 | 在 market-data 中加分析模块 | 职责膨胀，市场数据获取和策略评分不应耦合 |
| C. 后端 TypeScript 计算 | Hono 中用 npm 包计算 | JS 量化库极少，无 K线形态识别，无法扩展到缠论/波浪 |

### 2.2 核心原则

1. **全链路算法化，LLM 只做翻译** — 从指标计算到最终评分全部由确定性代码完成（零幻觉、可测试、可回测），LLM 仅将结构化结果翻译成自然语言报告
2. **因子标准化** — 所有因子用标准算子计算，输出可跨标的、跨时间比较的标准化值
3. **策略可组合** — 每个策略（信号引擎）是独立的 Python 类，互不依赖，用户未来可选择启用的策略组合
4. **取代现有 agent 服务中的 LLM 直接分析模式** — 现有 VoltAgent+DeepSeek 的"让 LLM 看指标猜结论"将被 ta-engine 的纯算法计算取代
5. **策略配置化** — 策略的参数、权重、阈值通过配置文件定义，可调优、可回测验证

### 2.3 Vibe-Trading Skill 模式的正确理解

调研中发现 Vibe-Trading 的 Skill 模式容易误解，在此澄清：

**Vibe-Trading 实际架构：**
- `SignalEngine` 是纯 Python 代码（pandas/numpy），不涉及 LLM
- `example_signal_engine.py` 里的 `generate()` 方法是确定性的：算指标 → 判断条件 → 投票 → 输出 1/-1/0
- `SKILL.md` 是给 LLM agent 的"知识包"，当用户请求时 LLM 读 Skill 了解方法论，然后**写代码**，代码再确定性执行
- **不是** LLM 读 Skill 后直接做评分

**对我们项目的启示：**
- 我们的信号引擎也应该是纯 Python 代码（参考 `technical-basic/example_signal_engine.py` 的模式）
- "Skill" 在我们项目里对应的是**策略配置文件**（参数 + 权重 + 阈值），不是给 LLM 读的 prompt
- LLM 的唯一角色是将算法产出的结构化结果翻译成自然语言报告

### 2.3 因子类型决策

- **第一版做时序因子**：针对单只股票的时间序列信号，和现有单股分析流程契合
- **第二版扩展截面因子**：横截面对比多只股票，用于自选股筛选排序

---

## 三、产品概念体系

### 3.1 四层原子概念

从底向上，每层有明确的定义和边界：

```
指标 (Indicator)
  │  TA-Lib / pandas 从 OHLCV 计算的原始数值
  │  无预测意义，只是客观数据
  ▼
算子 (Operator)                    ← ts_mean, ts_std, delta, rank, ts_corr, decay_linear...
  │  组合指标，进行标准化加工
  ▼
因子 (Alpha Factor)
  │  标准化后的值，具有对收益的预测能力
  │  有 theme 标签、有 min_warmup_bars、可 IC 验证
  ▼
阈值条件
  ▼
信号 (Signal)
  │  因子触发阈值后的离散触发点
  │  有方向(多/空/中性)和强度(0-100)
  ▼
逻辑组合 + 参数配置
  ▼
策略 / 信号引擎 (SignalEngine)
  │  输入 OHLCV → 输出 1(做多)/-1(做空)/0(观望)
  ▼
多策略加权汇总 + LLM 解读
  ▼
分析报告 (Analysis Report)
```

### 3.2 指标 (Indicator)

从 OHLCV 数据算出的客观度量，纯数据，无观点。

| 类别 | 指标示例 | 来源 |
|------|---------|------|
| 价格 | close, high, low, open | OHLCV 原始 |
| 趋势 | MA(5/10/20/60), EMA(12/26), DMI_ADX | TA-Lib |
| 动量 | RSI(6/12/14/24), MACD, KDJ(K/D/J) | TA-Lib |
| 波动 | ATR(14), BOLL(upper/mid/lower), BOLL_width | TA-Lib |
| 成交量 | VOL, VOL_MA(5/20), OBV, VOL_ratio | TA-Lib / pandas |
| 形态 | CDL_HAMMER, CDL_ENGULFING, CDL_DOJI... (61个) | TA-Lib |

指标由 TA-Lib 统一计算。现有 market-data 服务已有部分指标（RSI/MACD/EMA/KDJ/BOLL/MA，用 pandas-ta），V1 中 ta-engine 将用 TA-Lib 重新实现全量 150+ 指标。

### 3.3 算子 (Operator)

借鉴 Vibe-Trading 的 19 个标准算子，用于将指标加工为因子：

| 类别 | 算子 | 作用 |
|------|------|------|
| 时序 | `ts_mean(df, n)` | 滚动均值 |
| 时序 | `ts_std(df, n)` | 滚动标准差 |
| 时序 | `ts_corr(x, y, n)` | 滚动相关性 |
| 时序 | `ts_rank(df, n)` | 滚动排名 |
| 时序 | `ts_max(df, n)` / `ts_min(df, n)` | 滚动最大/最小 |
| 差分 | `delta(df, d)` | d 日差分（d>=1，禁止负值防前视偏差） |
| 衰减 | `decay_linear(df, n)` | 线性加权移动平均 |
| 安全 | `safe_div(a, b)` | 防除零除法 |
| 截面 | `rank(df)` | 截面百分位排名（V2 使用） |
| 截面 | `scale(df, a)` | 截面 L1 归一化（V2 使用） |

### 3.4 因子 (Alpha Factor)

指标经过算子组合后的标准化值，具有预测能力。

**关键区别：** 因子 ≠ 指标。RSI=32 是指标，`delta(RSI, 5) / ts_std(RSI, 20)` 是因子。

**V1 因子清单（15 个时序因子）：**

| Theme | 因子名 | 算子表达式 | 含义 |
|-------|--------|-----------|------|
| momentum | 短期动量 | `delta(close, 5) / ts_std(close, 20)` | 5日涨幅相对历史波动的标准化 |
| momentum | 中期动量排名 | `ts_rank(close / ts_mean(close, 60), 20)` | 价格相对60日均值的20日时序排名 |
| reversal | RSI 偏离加速度 | `delta(RSI_14, 3) / ts_std(RSI_14, 30)` | RSI 变化速率相对历史波动的标准化 |
| reversal | MACD 柱状图动量 | `delta(MACD_hist, 1) / ts_std(MACD_hist, 20)` | MACD 柱状图变化率的标准化 |
| volume | 量价相关因子 | `ts_corr(delta(close,1), delta(volume,1), 10)` | 量价变化的10日滚动相关性 |
| volume | 量能偏离 | `safe_div(volume, ts_mean(volume, 20))` | 当日成交量相对20日均值的比率 |
| volume | OBV 趋势强度 | `delta(OBV, 10) / ts_std(OBV, 20)` | OBV 10日变化相对波动的标准化 |
| volatility | 波动率压缩 | `ts_std(close, 10) / ts_std(close, 60)` | 短期波动率相对长期波动率的比值 |
| volatility | 布林带宽度 | `(BB_upper - BB_lower) / BB_mid` | 布林带收窄/扩张程度 |
| volatility | 真实波幅百分位 | `ts_rank(ATR_14 / close, 60)` | 当前波动率的60日百分位 |
| microstructure | K线形态得分 | `sum(看涨形态 +1) + sum(看跌形态 -1)` | 所有 TA-Lib 识别到的形态投票汇总 |
| microstructure | 缺口因子 | `(open - prev_close) / ATR` | 跳空缺口相对波动率的大小 |
| momentum | EMA 交叉强度 | `(EMA12 - EMA26) / ts_std(EMA12 - EMA26, 20)` | 快慢线差距的标准化 |
| reversal | KDJ 超买超卖 | `(J - ts_mean(J, 20)) / ts_std(J, 20)` | KDJ-J 值的标准化偏离 |
| volume | 资金流向强度 | `ts_corr(close - open, volume, 10)` | 实体方向与成交量的相关性 |

每个因子需满足：
- 输出是标准化值（z-score / ratio / percentile），可跨标的比较
- 有明确的 theme 标签
- 有 `min_warmup_bars`（最少需要多少根K线才能开始计算）
- 后续版本可用 IC/IR 验证预测能力

### 3.5 信号 (Signal)

因子触发了某个阈值条件，产生离散的交易触发点。

```
信号 = 因子 + 阈值条件 → {triggered: bool, direction: long/short/neutral, strength: 0-100}
```

| 信号名 | 依赖因子 | 触发条件 | 方向 |
|--------|---------|---------|------|
| 动量启动 | 短期动量因子 | 从负转正穿过 0 | 多 |
| 动量衰减 | 短期动量因子 | > 1.5 后回落至 0.5 以下 | 空 |
| 超卖反转 | RSI 偏离加速度因子 | < -1.5 且拐头向上 | 多 |
| 超买回调 | RSI 偏离加速度因子 | > 1.5 且拐头向下 | 空 |
| MACD 动能转正 | MACD 柱状图动量因子 | 从负转正 | 多 |
| MACD 动能衰竭 | MACD 柱状图动量因子 | > 1.5 后回落至 0.5 以下 | 空 |
| 量价共振 | 量价相关因子 | > 0.5 且上升 | 多（量价同向放大） |
| 量价背离 | 量价相关因子 | < -0.5 | 空（价涨量缩或价跌量增） |
| 放量突破 | 量能偏离因子 | > 2.0 且价格突破 20 日新高 | 多 |
| 缩量地量 | 量能偏离因子 | < 0.5 | 中性（关注度极低，变盘前兆） |
| 波动收敛 | 波动率压缩因子 | < 0.5 | 中性（即将变盘） |
| 波动扩张 | 波动率压缩因子 | > 2.0 | 中性（波动率急剧放大） |
| 形态看涨共振 | K线形态得分因子 | > 2（多个看涨形态同时出现） | 多 |
| 形态看跌共振 | K线形态得分因子 | < -2 | 空 |
| 跳空高开 | 缺口因子 | > 1.0 | 多 |
| 跳空低开 | 缺口因子 | < -1.0 | 空 |

### 3.6 策略 / 信号引擎 (SignalEngine)

借鉴 Vibe-Trading 的 `SignalEngine` 类：一个策略就是一个信号引擎，接收 OHLCV DataFrame，输出信号序列（1/-1/0）。

#### 策略 1：趋势跟踪引擎 (Trend Following)

```
必要前提：趋势强度（EMA交叉强度因子 + ADX）> 阈值（有明确趋势才做趋势跟踪）
  ├─ 入场：动量启动信号（权重 40%）
  ├─ 确认：量价共振信号（权重 30%）
  └─ 过滤：波动收敛刚结束（权重 30%）
无趋势（ADX < 25 且 EMA 交叉弱）→ 返回 HOLD + 低 confidence
```

#### 策略 2：动量反转引擎 (Momentum Reversal)

```
不依赖趋势（震荡市也能用）
  ├─ 主信号：超卖反转 / 超买回调（权重 40%）
  ├─ 辅助：MACD 动能方向（权重 30%）
  └─ 确认：量能偏离配合（权重 30%）
```

#### 策略 3：量价分析引擎 (Volume-Price Analysis)

```
  ├─ 量价背离（权重 40%）— 最高优先级，背离是最强信号
  ├─ 量价共振确认（权重 35%）
  └─ 缩量地量（权重 25%）— 变盘前兆
```

#### 策略 4：形态识别引擎 (Pattern Recognition)

```
  └─ K线形态得分因子的加权投票
     所有 TA-Lib 识别到的看涨形态(+1) - 看跌形态(-1) 汇总
     得分 > 2 → BUY, 得分 < -2 → SELL, 否则 HOLD
```

### 3.7 评分机制：纯算法评分

#### 核心原则

从指标到评分，整条链路全部由确定性 Python 代码完成（参考 Vibe-Trading 的 `SignalEngine` 模式）：

```
指标(算法) → 因子(算法) → 信号(算法) → 评分(算法) → 结构化结果
                                                     ↓
                                              LLM 翻译成自然语言报告（可选）
```

**为什么评分也必须是算法，不能用 LLM：**

| | 算法评分 | LLM 评分 |
|---|---|---|
| 确定性 | ✅ 同一输入永远同一输出 | ❌ 非确定性 |
| 可单元测试 | ✅ 断言固定值 | ❌ 无法回归测试 |
| 可回测 | ✅ 跑历史数据验证准确率 | ❌ 结果不可复现 |
| 可调优 | ✅ 改参数/权重，效果可量化 | ❌ 改 prompt，效果不确定 |
| 可审计 | ✅ 逻辑透明，能解释每个分数来源 | ❌ 黑箱 |

#### 评分实现

参考 Vibe-Trading `technical-basic/example_signal_engine.py` 的投票机制：

```python
class TrendFollowingEngine:
    """趋势跟踪信号引擎"""

    def __init__(self, config: StrategyConfig):
        self.config = config  # 参数、权重、阈值从配置读取

    def generate(self, df: pd.DataFrame) -> StrategyResult:
        # 1. 计算因子（确定性）
        factors = self.compute_factors(df)

        # 2. 检测信号（确定性）
        signals = self.detect_signals(factors)

        # 3. 投票/加权评分（确定性）
        score = 0.0
        active_signals = []

        if signals.momentum_start.triggered:
            score += self.config.momentum_weight * signals.momentum_start.strength
            active_signals.append(signals.momentum_start)

        if signals.volume_resonance.triggered:
            score += self.config.volume_weight * signals.volume_resonance.strength
            active_signals.append(signals.volume_resonance)

        # ... 其他信号

        return StrategyResult(
            score=score,             # -100 ~ +100
            signal=classify(score),  # BUY / HOLD / SELL
            confidence=calc_confidence(active_signals),
            active_signals=active_signals,
            factors=factors.snapshot()
        )
```

#### 综合评分

多个策略引擎独立评分后，加权汇总：

```python
def compute_overall(results: Dict[str, StrategyResult]) -> OverallResult:
    weights = {
        "trend": 0.35,
        "momentum": 0.30,
        "volume": 0.20,
        "pattern": 0.15,
    }

    overall_score = sum(
        weights[name] * result.score
        for name, result in results.items()
    )

    return OverallResult(
        overall_score=overall_score,
        signal=classify(overall_score),
        confidence=compute_confidence(results),
        dimensions=results,
    )
```

权重从策略配置文件中读取，后续可通过回测数据优化。

#### LLM 的角色

LLM 只做一件事：**将结构化结果翻译成自然语言报告**。

```python
# LLM 输入：已经算好的结构化数据
llm_input = {
    "symbol": "AAPL",
    "overall_score": +62,
    "signal": "BUY",
    "dimensions": {
        "trend": {"score": +78, "signal": "BUY", "active_signals": ["MA多头排列", "MACD金叉"]},
        "momentum": {"score": +55, "signal": "BUY", "active_signals": ["RSI超卖反弹"]},
        "volume": {"score": +40, "signal": "HOLD", "active_signals": ["量能萎缩"]},
        "pattern": {"score": +70, "signal": "BUY", "active_signals": ["看涨吞没"]},
    },
    "factors": {"momentum_short": 1.2, "rsi_deviation": -1.8, ...},
    "indicators": {"RSI_14": 32.5, "MACD_hist": 0.34, ...},
}

# LLM 输出：自然语言解读
llm_output = """
当前AAPL技术面综合评分+62，信号BUY。

趋势跟踪(+78)：MA5>MA20>MA60多头排列明确，MACD刚形成金叉，ADX>25表明趋势较强。
动量震荡(+55)：RSI从超卖区域(32.5)拐头向上，但尚未进入强势区间。
量价分析(+40)：成交量持续萎缩，量能偏离因子偏低，需关注突破是否有资金确认。
K线形态(+70)：昨日出现看涨吞没形态，且与趋势方向一致。

风险提示：量能萎缩是主要隐忧，若无放量配合，突破可能失败。
"""
```

LLM 不做任何评分决策，只是把已有的数据组织成人类可读的文字。即使 LLM 不可用，结构化结果仍然完整可用。

#### 输出结构：

```typescript
interface TechnicalAnalysisResult {
  symbol: string
  timestamp: string

  // 综合评分
  overall_score: number        // -100 ~ +100
  signal: 'BUY' | 'HOLD' | 'SELL'
  confidence: number           // 0 ~ 100

  // 四维度独立评分
  dimensions: {
    trend: DimensionScore
    momentum: DimensionScore
    volume: DimensionScore
    pattern: DimensionScore
  }

  // 活跃信号列表
  active_signals: Array<{
    name: string
    direction: 'long' | 'short' | 'neutral'
    strength: number
    factor_value: number
  }>

  // 因子快照
  factors: Record<string, number>

  // 原始指标快照
  indicators: Record<string, number | object>

  // LLM 解读（可选）
  llm_summary?: string
}
```

**前端展示形态：**

```
┌─────────────────────────────────────────┐
│           AAPL 技术面分析报告             │
│                                          │
│  综合评分: +62  信号: BUY  强度: 75      │
│                                          │
│  ┌──────────┬───────┬─────────┬───────┐ │
│  │ 趋势跟踪  │ 动量震荡│ 成交量分析│K线形态 │ │
│  │   +78    │  +55   │   +40   │  +70  │ │
│  │   BUY    │  BUY   │  HOLD   │  BUY  │ │
│  └──────────┴───────┴─────────┴───────┘ │
│                                          │
│  活跃信号:                                │
│  ✅ MA多头排列 (强度: 85)                 │
│  ✅ MACD金叉 (强度: 70)                   │
│  ⚠️ 量能萎缩 (强度: 45)                  │
│  ✅ 看涨吞没形态 (强度: 80)               │
│                                          │
│  AI 解读:                                 │
│  "当前处于上升趋势中，MA多头排列明确，     │
│   MACD刚形成金叉。但需注意成交量在萎缩，   │
│   突破的持续性存疑..."                     │
└─────────────────────────────────────────┘
```

---

## 四、系统架构

### 4.1 整体流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户请求分析                                   │
│                  (前端 research 页面)                             │
└──────────────┬──────────────────────────────────────────────────┘
               │ POST /api/analysis/start
               ▼
┌──────────────────────────┐      ┌─────────────────────┐
│   api/business (Hono)    │─────►│  Redis (BullMQ 队列) │
│   分析任务入队 + SSE      │      └──────────┬──────────┘
└──────────────────────────┘                 │
                                             │ Worker 消费
                                             ▼
┌──────────────────────────────────────────────────────────────┐
│                    services/ta-engine (新)                     │
│                    FastAPI, 端口 8003                           │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  计算层（全部确定性 Python 代码，参考 Vibe-Trading         │  │
│  │         technical-basic/example_signal_engine.py 模式）   │  │
│  │                                                          │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐ │  │
│  │  │  指标计算      │  │  因子计算      │  │  信号检测      │ │  │
│  │  │  TA-Lib       │─►│  标准算子组合  │─►│  阈值条件判断  │ │  │
│  │  │  150+ 指标    │  │  15 个因子    │  │  16 个信号    │ │  │
│  │  │  61 K线形态   │  │              │  │              │ │  │
│  │  └──────────────┘  └──────────────┘  └───────┬───────┘ │  │
│  │                                              │         │  │
│  │  ┌───────────────────────────────────────────┘         │  │
│  │  │                                                      │  │
│  │  ▼                                                      │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  评分层（确定性投票/加权）                          │  │  │
│  │  │                                                    │  │  │
│  │  │  4 个策略引擎独立评分 → 加权汇总 → 综合评分         │  │  │
│  │  │  输出：score(-100~+100) + signal(BUY/HOLD/SELL)    │  │  │
│  │  │        + confidence + active_signals + factors     │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  策略配置文件                                             │  │
│  │  strategies/                                              │  │
│  │  ├── trend_following.yaml    趋势跟踪参数+权重+阈值       │  │
│  │  ├── momentum_reversal.yaml  动量反转参数+权重+阈值       │  │
│  │  ├── volume_price.yaml       量价分析参数+权重+阈值       │  │
│  │  ├── pattern.yaml            形态识别参数+权重+阈值       │  │
│  │  └── weights.yaml            综合评分维度权重配置         │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  LLM 翻译层（可选）                                       │  │
│  │  将结构化结果翻译成自然语言报告                             │  │
│  │  不参与任何评分决策                                        │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                                │
│  ┌──────────────────────────────────────────────────────┐     │
│  │              K-line 数据                               │     │
│  │   从 market-data 服务获取或从 TimescaleDB 直接读取      │     │
│  └──────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

### 4.2 ta-engine 服务内部结构

```
services/ta-engine/
├── app/
│   ├── main.py                 # FastAPI 入口
│   ├── config.py               # 配置（端口、数据源地址等）
│   ├── api/
│   │   └── routes.py           # API 路由
│   ├── core/
│   │   ├── operators.py        # 19 个标准算子（ts_mean, delta, rank...）
│   │   ├── indicators.py       # TA-Lib 指标计算封装
│   │   ├── factors.py          # 因子注册表 + 15 个因子实现
│   │   └── signals.py          # 信号检测（阈值条件判断）
│   ├── engines/                # 信号引擎（策略）— 纯 Python 代码
│   │   ├── base.py             # SignalEngine 基类
│   │   ├── trend.py            # 趋势跟踪引擎
│   │   ├── momentum.py         # 动量反转引擎
│   │   ├── volume.py           # 量价分析引擎
│   │   └── pattern.py          # 形态识别引擎
│   ├── strategies/             # 策略配置文件（参数 + 权重 + 阈值）
│   │   ├── trend_following.yaml
│   │   ├── momentum_reversal.yaml
│   │   ├── volume_price.yaml
│   │   ├── pattern.yaml
│   │   └── weights.yaml        # 综合评分维度权重
│   ├── services/
│   │   ├── analyzer.py         # 分析编排器（指标→因子→信号→评分）
│   │   └── data_fetcher.py     # 从 market-data 获取 K-line
│   └── models/
│       ├── request.py          # 请求模型
│       └── response.py         # 响应模型（TechnicalAnalysisResult）
├── Dockerfile
├── requirements.txt
└── pyproject.toml
```

### 4.3 API 设计

```
POST /api/analyze
  Body: {
    "symbol": "AAPL",
    "market": "us",
    "period": "1d",
    "skill": "comprehensive"   // 可选，默认 comprehensive
  }
  Response: TechnicalAnalysisResult (完整分析结果)

GET /api/analyze/{task_id}
  Response: TechnicalAnalysisResult (异步模式，查询结果)

GET /api/skills
  Response: 可用 Skill 列表 + 描述

GET /api/factors
  Query: symbol=AAPL
  Response: 因子列表 + 当前值（不含 LLM 解读，纯算法结果）

GET /api/health
  Response: { "status": "ok" }
```

### 4.4 分析流程详解

一次完整分析的执行步骤：

```
1. 接收请求
   POST /api/analyze { symbol: "AAPL", skill: "comprehensive" }

2. 获取 K-line 数据
   → 从 market-data 服务拉取 AAPL 日线（最近 250 根）

3. 计算指标（确定性）
   → TA-Lib 计算 150+ 指标 + 61 个 K线形态

4. 计算因子（确定性）
   → 15 个因子各自用标准算子计算，输出标准化值

5. 检测信号（确定性）
   → 每个因子对照阈值条件，输出 triggered/untriggered

6. Skill 引导的 LLM 解读
   → 加载 comprehensive.md Skill 模板
   → 将因子值 + 活跃信号 + 指标快照 + Skill 模板 组装成 prompt
   → 调用 LLM，要求 JSON Schema 约束的输出
   → 后处理验证：score 范围、signal 枚举、必填字段

7. 返回结果
   → TechnicalAnalysisResult 完整结构
```

步骤 1-5 全部是确定性算法，步骤 6 由 Skill 约束 LLM。
如果 LLM 不可用，步骤 1-5 的结果仍然可以返回（因子值 + 信号列表，只是没有评分和解读）。

### 4.5 与现有系统集成

1. **取代 agent 服务的技术分析能力** — ta-engine 替换掉 agent 服务中 `get_indicators` tool + LLM 直接分析的模式
2. **复用 BullMQ 队列** — api/business 将分析任务入队，ta-engine 的 worker 消费
3. **复用 SSE 流式推送** — 前端通过 SSE 实时获取分析进度
4. **复用 market-data 的 K-line 数据** — ta-engine 从 market-data 服务获取 OHLCV 数据
5. **LLM 解读层可选** — 可以不开 LLM，纯输出因子值和信号列表

### 4.6 与 Agent 服务（VoltAgent）的协作

ta-engine 定位是**纯计算层**——不包含 LLM，只输出确定性结构化数据。
LLM 翻译和后续深度分析放在现有的 **VoltAgent 服务**（`services/agent/`）中。

**职责划分：**

| | ta-engine (新) | agent 服务 (现有 VoltAgent) |
|---|---|---|
| 职责 | 纯计算：指标→因子→信号→评分 | 智能分析：LLM 翻译 + 深度推理 |
| LLM | 无 | DeepSeek / Claude |
| 输出 | 结构化 JSON（因子、信号、评分） | 自然语言分析报告 |
| 可测试性 | 100% 可单元测试 | 不可单元测试（LLM 非确定性） |

**V1 协作流程：**

```
ta-engine
  │ POST /api/analyze → 返回结构化结果
  ▼
VoltAgent 服务
  │ 拿到 ta-engine 结果 → 调用 LLM 翻译成自然语言报告
  ▼
前端（SSE 流式展示）
```

**后续版本协作流程：**

```
ta-engine
  │ 结构化结果（因子 + 信号 + 评分 + 指标快照）
  ▼
VoltAgent 服务
  │ 1. LLM 翻译技术面结果为自然语言
  │ 2. 结合基本面、新闻情绪做多维解读
  │ 3. 多 Agent 辩论（多空视角，参考 TradingAgents-CN）
  │ 4. 结合用户持仓（Paper Trading）给个性化建议
  │ 5. 自选股池横向对比和排序
  ▼
前端（个性化分析报告）
```

这样 ta-engine 保持纯计算、高可测试性，agent 服务负责所有 LLM 相关的智能分析。

---

## 五、Roadmap

### V1：时序因子 + Skill 引导的 LLM 分析（MVP）— 当前要做的

**范围：**
- 新建 `services/ta-engine/` (FastAPI, 端口 8003)
- TA-Lib 计算全量指标（150+）+ 61 个 K线形态
- 15 个时序因子（momentum/reversal/volume/volatility/microstructure）
- 信号检测（阈值条件判断）
- 5 个内置 Skill 模板（趋势跟踪 / 动量反转 / 量价分析 / 形态识别 / 综合）
- Skill 引导的 LLM 评分 + 解读（JSON Schema 约束输出）
- 接入现有分析流程（BullMQ + SSE）
- 前端报告页展示四维评分 + 活跃信号 + LLM 解读

**交付物：** 用户输入一个 ticker → 选择 Skill → 返回完整技术面分析报告

### V2：截面因子 + 自选股筛选

**新增：**
- 截面因子计算：同一时间截面上，对所有自选股计算因子值
- `rank()` / `scale()` 截面算子
- 自选股排行榜：按综合因子得分排序，推荐 TOP N
- 因子看板：展示各因子在自选股中的分布热力图
- 多周期支持：日线 / 周线 / 月线分别计算

**参考：** Vibe-Trading `multi-factor` SignalEngine + `rank/scale` 算子

### V3：因子验证 + 策略回测

**新增：**
- IC/IR 计算：验证每个因子对收益的预测能力
- 因子分类：Alive / Reversed / Dead
- 因子衰减监控：跟踪因子有效性随时间的变化
- 策略回测：信号引擎输出接入回测系统，计算 Sharpe / 最大回撤 / 胜率
- Walk-Forward 验证：防止过拟合
- 回测报告：每条策略附带历史回测绩效

**参考：** Vibe-Trading `bench_runner` + `validation.py` + AST 纯度门

### V4：高级分析模块

**新增模块（每个都是独立的信号引擎）：**
- 缠论模块：分型 → 笔 → 线段 → 中枢 → 买卖点（参考 chan.py）
- 波浪理论：Elliott Wave 识别（需自建）
- 一目均衡表：转换线 / 基准线 / 云带（参考 Vibe-Trading `ichimoku` skill）
- 谐波模式：Gartley / Bat / Butterfly（参考 Vibe-Trading `harmonic` skill）
- SMC 聪明钱：订单块 / 流动性扫荡（参考 Vibe-Trading `smc` skill）

### V5：用户自定义策略 + Skill 市场

**新增：**
- Skill 编辑器：Web UI 中编写自定义分析方法论（Markdown 模板）
- 因子表达式引擎：支持 `rank(ts_corr(delta(close,1), delta(volume,1), 10))`
- AST 安全检查：防止前视偏差和危险代码
- Skill 市场：用户发布的 Skill 可被其他人使用和评分
- 参数优化：网格搜索 / LLM 辅助调参
- Skill 回测验证：跑历史数据验证 Skill 指导下的分析准确率

### V6：市场状态感知 + 自适应策略

**新增：**
- 市场状态分类器：趋势 / 震荡 / 高波动 / 风险 off（参考 CryptoQuant AI）
- 宏观因子门控：利率环境 / VIX / 经济周期作为策略开关
- 自适应参数：趋势市时趋势策略权重自动提高
- 自适应止盈止损：根据波动率动态调整（ATR based）

### 长期愿景：全栈量化研究平台

- 对接 Vibe-Trading 生态：支持导入 Alpha101/qlib158/gtja191 因子库
- 多资产覆盖：A股 / 港股 / 美股 / 加密货币 / 期货
- 组合优化：MVO / 风险平价 / 等波动
- 从研究到执行：信号 → Paper Trading → 实盘

### Roadmap 演进图

```
V1 时序因子+四策略引擎          ← 当前
 │
 ├─ V2 截面因子+自选股筛选
 │    │
 │    ├─ V3 因子验证+策略回测
 │    │    │
 │    │    ├─ V4 高级分析（缠论/波浪/一目/谐波/SMC）
 │    │    │
 │    │    ├─ V5 用户自定义策略+因子市场
 │    │    │
 │    │    └─ V6 市场状态感知+自适应
 │    │
 │    └─ (V4-V6 可并行发展)
 │
 └─ 长期：全栈量化研究平台
```

每个版本增量式扩展，V1 的因子/信号/策略架构在后续版本中不需要重构。

---

## 六、技术选型

| 组件 | 选型 | 理由 |
|------|------|------|
| 框架 | FastAPI | 和现有 market-data / scheduler 保持一致 |
| 指标计算 | TA-Lib (C + Python wrapper) | 行业标准，200+ 指标 + 61 K线形态，性能最优 |
| 数据处理 | pandas + numpy | 和 TA-Lib / 算子兼容，Vibe-Trading 也用 pandas |
| K线数据 | 从 market-data 服务获取 | 复用现有数据源，不重复造轮子 |
| LLM 解读 | DeepSeek Chat (可选) | 现有 agent 服务已配置，成本低 |
| Docker | 需要 TA-Lib C 库编译 | Dockerfile 中加 `build-base && wget ta-lib && make` |

---

## 七、调研资料索引

| 项目 | 本地调研文档 | GitHub |
|------|-------------|--------|
| Vibe-Trading | `/Users/xuan/Documents/xuan/vibe_trading/` | https://github.com/HKUDS/Vibe-Trading |
| TradingAgents-CN | `/Users/xuan/Documents/xuan/tradingagents_cn/` | — |
| Daily Stock Analysis | `/Users/xuan/Documents/xuan/daily_stock_analysis/` | — |
| QuantDinger | `/Users/xuan/Documents/xuan/quantdinger/` | — |
| TradeOdds | `/Users/xuan/Documents/xuan/tradeodds/` | — |
| CryptoQuant AI | `/Users/xuan/Documents/xuan/cryptoquant_ai/` | — |
| FinceptTerminal | `/Users/xuan/Documents/xuan/fincept_terminal/` | — |
| EarningSpike | `/Users/xuan/Documents/xuan/earningspike/` | — |
| chan.py | — | https://github.com/Vespa314/chan.py |
| ta-lib-python | — | https://github.com/ta-lib/ta-lib-python |
| ta (bukosabino) | — | https://github.com/bukosabino/ta.ts |
| ElliottWaveAnalyzer | — | https://github.com/drstevendev/ElliottWaveAnalyzer |
