FROM python:3.12-slim

WORKDIR /app

# 使用阿里云镜像源 + 安装编译依赖 + pip install + 清理编译工具
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources && \
    apt-get update && apt-get install -y gcc && \
    pip install --no-cache-dir \
        fastapi>=0.104.0 \
        "uvicorn[standard]>=0.24.0" \
        pydantic>=2.5.0 \
        pydantic-settings>=2.1.0 \
        yfinance>=0.2.32 \
        akshare>=1.12.0 \
        pandas>=2.1.0 \
        pandas-ta>=0.3.14b0 \
        sqlalchemy>=2.0.0 \
        asyncpg>=0.29.0 \
        redis>=5.0.0 \
        httpx>=0.25.0 \
        python-dotenv>=1.0.0 \
        -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    apt-get remove -y gcc && apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/* /root/.cache

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
