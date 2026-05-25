import pandas as pd
import numpy as np
from .strategies import IndicatorStrategy
from .fees import FEE_MODELS, calculate_fee


class BacktestEngine:
    def __init__(self, strategy: IndicatorStrategy, df: pd.DataFrame,
                 initial_capital: float = 1000000.0, fee_model_name: str = "a_stock"):
        self.strategy = strategy
        self.df = df
        self.initial_capital = initial_capital
        self.fee_model = FEE_MODELS.get(fee_model_name, FEE_MODELS["a_stock"])

    def run(self) -> dict:
        signals = self.strategy.generate_signals(self.df)

        cash = self.initial_capital
        position = 0.0
        entry_price = 0.0
        trades = []
        equity_curve = []

        for i in range(len(self.df)):
            row = self.df.iloc[i]
            signal = int(signals.iloc[i]) if i < len(signals) else 0
            price = float(row["close"])

            if signal == 1 and position == 0 and cash > 0:
                quantity = cash / price
                fee = calculate_fee(price, quantity, "buy", self.fee_model)
                entry_price = price
                position = quantity
                cash = -fee
                trades.append({"time": str(row.name), "side": "buy", "price": price, "quantity": quantity, "fee": fee})

            elif signal == -1 and position > 0:
                fee = calculate_fee(price, position, "sell", self.fee_model)
                proceeds = position * price - fee
                pnl = proceeds - (position * entry_price)
                cash = proceeds
                trades.append({"time": str(row.name), "side": "sell", "price": price, "quantity": position, "fee": fee, "pnl": pnl})
                position = 0.0

            equity_curve.append(cash + position * price)

        metrics = self._calc_metrics(equity_curve, trades)
        return {"metrics": metrics, "equity_curve": equity_curve, "trades": trades}

    def _calc_metrics(self, equity_curve: list, trades: list) -> dict:
        if len(equity_curve) < 2:
            return {"totalReturn": 0, "sharpe": 0, "maxDrawdown": 0, "winRate": 0, "profitFactor": 0, "tradeCount": 0}

        eq = pd.Series(equity_curve)
        returns = eq.pct_change().dropna()
        total_return = (eq.iloc[-1] / self.initial_capital) - 1
        sharpe = float((returns.mean() / returns.std()) * np.sqrt(252)) if returns.std() > 0 else 0.0

        peak = eq.cummax()
        drawdown = (eq - peak) / peak
        max_drawdown = float(drawdown.min())

        closed = [t for t in trades if "pnl" in t]
        wins = [t for t in closed if t["pnl"] > 0]
        win_rate = len(wins) / len(closed) if closed else 0.0

        total_profit = sum(t["pnl"] for t in closed if t["pnl"] > 0)
        total_loss = abs(sum(t["pnl"] for t in closed if t["pnl"] < 0))
        profit_factor = total_profit / total_loss if total_loss > 0 else float("inf")

        return {
            "totalReturn": round(total_return, 4),
            "sharpe": round(sharpe, 4),
            "maxDrawdown": round(max_drawdown, 4),
            "winRate": round(win_rate, 4),
            "profitFactor": round(profit_factor, 4),
            "tradeCount": len(closed),
        }
