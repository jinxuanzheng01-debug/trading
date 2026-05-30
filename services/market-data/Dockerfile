FROM python:3.12-slim

WORKDIR /app

RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir \
        fastapi \
        uvicorn[standard] \
        pydantic \
        pydantic-settings \
        yfinance \
        pandas \
        sqlalchemy \
        asyncpg \
        redis \
        httpx \
        python-dotenv \
        akshare \
        pandas-ta \
        -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    rm -rf /root/.cache

COPY app/ ./app/

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
