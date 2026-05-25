from sqlalchemy import Column, String, DateTime, Numeric, BigInteger, Integer, Text
from sqlalchemy.sql import func
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class OHLCV(Base):
    """K线数据表"""
    __tablename__ = "ohlcv"

    time = Column(DateTime, primary_key=True)
    symbol = Column(String(50), primary_key=True)
    interval = Column(String(10), primary_key=True)
    open = Column(Numeric(20, 8), nullable=False)
    high = Column(Numeric(20, 8), nullable=False)
    low = Column(Numeric(20, 8), nullable=False)
    close = Column(Numeric(20, 8), nullable=False)
    volume = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

class SyncLog(Base):
    """同步日志表"""
    __tablename__ = "sync_log"

    id = Column(Integer, primary_key=True, autoincrement=True)
    symbol = Column(String(50), nullable=False)
    interval = Column(String(10), nullable=False)
    start_date = Column(DateTime, nullable=False)
    end_date = Column(DateTime, nullable=False)
    records_count = Column(Integer, nullable=False)
    status = Column(String(20), nullable=False)  # success, error
    error_message = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
