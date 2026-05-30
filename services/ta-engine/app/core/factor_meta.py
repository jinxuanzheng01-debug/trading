"""因子元数据：名称、公式、解读规则。供 LLM 理解因子含义。"""

FACTOR_META = {
    "momentum_short": {
        "name_cn": "短期动量",
        "formula": "delta(close, 5) / ts_std(close, 20)",
        "description": "5日涨幅相对历史波动的标准化。正值=动量向上，负值=动量向下。",
        "typical_range": "通常在 -3 到 +3 之间",
        "extreme_readings": "< -2 强烈看空信号，> +2 强烈看多信号",
    },
    "momentum_mid_rank": {
        "name_cn": "中期动量排名",
        "formula": "ts_rank(close / ts_mean(close, 60), 20)",
        "description": "价格相对60日均值的20日时序排名。接近1=持续走强，接近0=持续走弱。",
        "typical_range": "0 到 1 之间的百分位",
        "extreme_readings": "> 0.8 强势，< 0.2 弱势",
    },
    "rsi_deviation": {
        "name_cn": "RSI偏离加速度",
        "formula": "delta(RSI_14, 3) / ts_std(RSI_14, 30)",
        "description": "RSI变化速率相对历史波动的标准化。衡量RSI偏离正常范围的速度。",
        "typical_range": "通常在 -3 到 +3",
        "extreme_readings": "< -1.5 超卖反弹信号，> +1.5 超买回调信号",
    },
    "macd_hist_momentum": {
        "name_cn": "MACD柱状图动量",
        "formula": "delta(MACD_histogram, 1) / ts_std(MACD_histogram, 20)",
        "description": "MACD柱状图变化率的标准化。衡量MACD动能在加速还是衰减。",
        "typical_range": "通常在 -3 到 +3",
        "extreme_readings": "从负转正=金叉动能启动，从正转负=死叉动能启动",
    },
    "volume_price_corr": {
        "name_cn": "量价相关因子",
        "formula": "ts_corr(delta(close,1), delta(volume,1), 10)",
        "description": "量价变化的10日滚动相关性。正=量价同向，负=量价背离。",
        "typical_range": "-1 到 +1",
        "extreme_readings": "< -0.5 强烈背离信号，> 0.5 强烈共振",
    },
    "volume_ratio": {
        "name_cn": "量能偏离",
        "formula": "volume / ts_mean(volume, 20)",
        "description": "当日成交量相对20日均值的比率。1.0=正常，>2=异常放量。",
        "typical_range": "0.3 到 3.0",
        "extreme_readings": "> 2.0 放量，< 0.5 缩量",
    },
    "obv_trend": {
        "name_cn": "OBV趋势强度",
        "formula": "delta(OBV, 10) / ts_std(OBV, 20)",
        "description": "OBV的10日变化相对波动的标准化。衡量资金流向的趋势强度。",
        "typical_range": "通常在 -3 到 +3",
        "extreme_readings": "正值=资金持续流入，负值=资金持续流出",
    },
    "volatility_compression": {
        "name_cn": "波动率压缩",
        "formula": "ts_std(close, 10) / ts_std(close, 60)",
        "description": "短期波动率相对长期波动率的比值。<1=波动收窄，>1=波动放大。",
        "typical_range": "0.3 到 2.5",
        "extreme_readings": "< 0.5 即将变盘（收敛），> 2.0 波动率急剧放大",
    },
    "bollinger_width": {
        "name_cn": "布林带宽度",
        "formula": "(BB_upper - BB_lower) / BB_mid",
        "description": "布林带宽度占价格的比例。收窄=即将变盘，扩张=趋势明确。",
        "typical_range": "0.02 到 0.15",
        "extreme_readings": "极窄=变盘前兆",
    },
    "atr_percentile": {
        "name_cn": "真实波幅百分位",
        "formula": "ts_rank(ATR_14 / close, 60)",
        "description": "当前波动率在60日内的百分位排名。高位=异常波动。",
        "typical_range": "0 到 1",
        "extreme_readings": "> 0.8 高波动期，< 0.2 低波动期",
    },
    "pattern_score": {
        "name_cn": "K线形态得分",
        "formula": "sum(看涨形态 +1) + sum(看跌形态 -1)",
        "description": "所有TA-Lib识别到的61个K线形态的投票汇总。",
        "typical_range": "-5 到 +5",
        "extreme_readings": "> 2 多个看涨形态共振，< -2 多个看跌形态共振",
    },
    "gap_factor": {
        "name_cn": "缺口因子",
        "formula": "(open - prev_close) / ATR",
        "description": "跳空缺口相对ATR的大小。衡量缺口的显著性。",
        "typical_range": "-2 到 +2",
        "extreme_readings": "> 1.0 显著跳空高开，< -1.0 显著跳空低开",
    },
    "ema_cross_strength": {
        "name_cn": "EMA交叉强度",
        "formula": "(EMA12 - EMA26) / ts_std(EMA12 - EMA26, 20)",
        "description": "快慢线差距的标准化。衡量均线交叉的力度。",
        "typical_range": "通常在 -3 到 +3",
        "extreme_readings": "从负转正=金叉，从正转负=死叉",
    },
    "kdj_j_deviation": {
        "name_cn": "KDJ超买超卖",
        "formula": "(J - ts_mean(J, 20)) / ts_std(J, 20)",
        "description": "KDJ-J值的标准化偏离。衡量J值偏离正常范围的程度。",
        "typical_range": "通常在 -3 到 +3",
        "extreme_readings": "< -2 超卖，> +2 超买",
    },
    "fund_flow_strength": {
        "name_cn": "资金流向强度",
        "formula": "ts_corr(close - open, volume, 10)",
        "description": "K线实体方向与成交量的相关性。正=阳线放量，负=阴线放量。",
        "typical_range": "-1 到 +1",
        "extreme_readings": "> 0.5 资金做多坚决，< -0.5 资金做空坚决",
    },
}


def get_factor_meta(factor_name: str) -> dict:
    """获取单个因子的元数据。"""
    return FACTOR_META.get(factor_name, {})


def get_all_factor_meta() -> dict:
    """获取全部因子元数据。"""
    return FACTOR_META
