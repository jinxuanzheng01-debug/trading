-- 添加字段到 watchlist_items
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE watchlist_items ADD COLUMN IF NOT EXISTS market VARCHAR(20);

-- 创建股票行情表
CREATE TABLE IF NOT EXISTS stock_quotes (
  symbol VARCHAR(50) PRIMARY KEY,
  market VARCHAR(20) NOT NULL,
  name VARCHAR(100),
  type VARCHAR(20),
  exchange VARCHAR(50),
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  turnover_rate DECIMAL(8, 4),
  prev_close DECIMAL(12, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  data_date DATE NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS stock_quotes_market_idx ON stock_quotes(market);
CREATE INDEX IF NOT EXISTS stock_quotes_interval_idx ON stock_quotes(interval);
CREATE UNIQUE INDEX IF NOT EXISTS symbol_interval_unique ON stock_quotes(symbol, interval);

-- 创建历史数据表
CREATE TABLE IF NOT EXISTS stock_quote_history (
  id SERIAL PRIMARY KEY,
  symbol VARCHAR(50) NOT NULL,
  market VARCHAR(20) NOT NULL,
  interval VARCHAR(10) NOT NULL,
  open DECIMAL(12, 4),
  high DECIMAL(12, 4),
  low DECIMAL(12, 4),
  close DECIMAL(12, 4),
  volume BIGINT,
  amount BIGINT,
  change DECIMAL(12, 4),
  change_percent DECIMAL(8, 4),
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(symbol, interval, timestamp)
);

CREATE INDEX IF NOT EXISTS stock_quote_history_symbol_idx ON stock_quote_history(symbol);
CREATE INDEX IF NOT EXISTS stock_quote_history_interval_idx ON stock_quote_history(interval);
CREATE INDEX IF NOT EXISTS stock_quote_history_timestamp_idx ON stock_quote_history(timestamp);
