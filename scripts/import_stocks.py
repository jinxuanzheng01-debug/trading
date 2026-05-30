"""
一次性脚本：导入美股全量列表到 stocks 表。

数据源：Wikipedia S&P 500 + NASDAQ 100 + 常见 ETF/中概股
后续可通过 NASDAQ Trader FTP 下载完整 listing CSV 替换
"""
import asyncio
import sys
from datetime import datetime

import httpx
import pandas as pd

API_URL = "http://localhost:4000"


async def get_existing_symbols(client: httpx.AsyncClient) -> set[str]:
    """获取 stocks 表中已有的代码"""
    resp = await client.get(f"{API_URL}/api/internal/stocks/symbols")
    resp.raise_for_status()
    data = resp.json()
    return set(data.get("symbols", []))


async def insert_stocks(client: httpx.AsyncClient, stocks: list[dict]) -> int:
    """批量插入股票"""
    count = 0
    for s in stocks:
        try:
            resp = await client.post(
                f"{API_URL}/api/internal/stocks/import",
                json=s,
            )
            if resp.status_code == 200:
                count += 1
        except Exception:
            pass
    return count


async def main():
    async with httpx.AsyncClient(timeout=30.0) as client:
        existing = await get_existing_symbols(client)
        print(f"已存在 {len(existing)} 只股票")

        # 1. Wikipedia S&P 500
        print("从 Wikipedia 获取 S&P 500...")
        try:
            sp500 = pd.read_html("https://en.wikipedia.org/wiki/List_of_S%26P_500_companies")[0]
            sp500_stocks = []
            for _, row in sp500.iterrows():
                symbol = str(row["Symbol"]).strip().replace(".", "-")
                name = str(row["Security"]).strip()
                if symbol not in existing:
                    sp500_stocks.append({
                        "symbol": symbol,
                        "name": name,
                        "exchange": "US",
                        "market": "US",
                        "type": "stock",
                    })
            print(f"  S&P 500 新股票: {len(sp500_stocks)}")
        except Exception as e:
            print(f"  S&P 500 获取失败: {e}")
            sp500_stocks = []

        # 2. NASDAQ 100 from Wikipedia
        print("从 Wikipedia 获取 NASDAQ 100...")
        try:
            ndx = pd.read_html("https://en.wikipedia.org/wiki/Nasdaq-100")[4]
            ndx_stocks = []
            for _, row in ndx.iterrows():
                symbol = str(row["Ticker"]).strip()
                name = str(row["Company"]).strip()
                if symbol not in existing:
                    ndx_stocks.append({
                        "symbol": symbol,
                        "name": name,
                        "exchange": "NASDAQ",
                        "market": "US",
                        "type": "stock",
                    })
            print(f"  NASDAQ 100 新股票: {len(ndx_stocks)}")
        except Exception as e:
            print(f"  NASDAQ 100 获取失败: {e}")
            ndx_stocks = []

        # 3. 常见中概股 + ETF
        popular = [
            ("BABA", "Alibaba Group Holding Ltd.", "NYSE"),
            ("JD", "JD.com Inc.", "NASDAQ"),
            ("PDD", "PDD Holdings Inc.", "NASDAQ"),
            ("NIO", "NIO Inc.", "NYSE"),
            ("BIDU", "Baidu Inc.", "NASDAQ"),
            ("BILI", "Bilibili Inc.", "NASDAQ"),
            ("TME", "Tencent Music Entertainment Group", "NYSE"),
            ("LI", "Li Auto Inc.", "NASDAQ"),
            ("XPEV", "XPeng Inc.", "NYSE"),
            ("SPY", "SPDR S&P 500 ETF Trust", "NYSE"),
            ("QQQ", "Invesco QQQ Trust", "NASDAQ"),
            ("IWM", "iShares Russell 2000 ETF", "NYSE"),
            ("DIA", "SPDR Dow Jones Industrial Average ETF", "NYSE"),
            ("TLT", "iShares 20+ Year Treasury Bond ETF", "NASDAQ"),
            ("GLD", "SPDR Gold Shares", "NYSE"),
            ("VTI", "Vanguard Total Stock Market ETF", "NYSE"),
            ("ARKK", "ARK Innovation ETF", "NYSE"),
            ("VOO", "Vanguard S&P 500 ETF", "NYSE"),
            ("SMH", "VanEck Semiconductor ETF", "NASDAQ"),
            ("XLE", "Energy Select Sector SPDR Fund", "NYSE"),
        ]
        popular_stocks = [
            {"symbol": s, "name": n, "exchange": e, "market": "US", "type": "stock"}
            for s, n, e in popular if s not in existing
        ]
        print(f"  常见股票: {len(popular_stocks)}")

        all_new = sp500_stocks + ndx_stocks + popular_stocks

        # Deduplicate by symbol
        seen = set()
        unique = []
        for s in all_new:
            if s["symbol"] not in seen:
                seen.add(s["symbol"])
                unique.append(s)

        print(f"\n总计新增: {len(unique)} 只")

        if unique:
            # 直接 SQL INSERT，通过 internal API
            for i in range(0, len(unique), 100):
                batch = unique[i:i + 100]
                # 用 raw SQL execute via curl
                for s in batch:
                    try:
                        resp = await client.post(
                            f"{API_URL}/api/internal/stocks/import",
                            json=s,
                        )
                        if resp.status_code != 200:
                            print(f"  Failed: {s['symbol']}")
                    except Exception as e:
                        print(f"  Error: {s['symbol']}: {e}")
                print(f"  已导入 {min(i + 100, len(unique))}/{len(unique)}")

        print(f"完成。stocks 表共 {len(existing) + len(unique)} 只股票")


if __name__ == "__main__":
    asyncio.run(main())
