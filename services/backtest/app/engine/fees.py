from dataclasses import dataclass


@dataclass
class FeeModel:
    commission_rate: float = 0.0003
    min_commission: float = 5.0
    stamp_tax_rate: float = 0.0
    slippage_rate: float = 0.001


FEE_MODELS = {
    "a_stock": FeeModel(commission_rate=0.0003, min_commission=5.0, stamp_tax_rate=0.001, slippage_rate=0.001),
    "us_stock": FeeModel(commission_rate=0.0, min_commission=0.0, stamp_tax_rate=0.0, slippage_rate=0.001),
    "crypto": FeeModel(commission_rate=0.001, min_commission=0.0, stamp_tax_rate=0.0, slippage_rate=0.002),
}


def calculate_fee(price: float, quantity: float, side: str, model: FeeModel) -> float:
    value = price * quantity
    commission = max(value * model.commission_rate, model.min_commission)
    stamp_tax = value * model.stamp_tax_rate if side == "sell" else 0.0
    slippage = value * model.slippage_rate
    return commission + stamp_tax + slippage
