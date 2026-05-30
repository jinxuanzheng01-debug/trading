FROM python:3.12-slim

WORKDIR /app

# 编译安装 TA-Lib C 库
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential wget && \
    wget -q https://github.com/ta-lib/ta-lib/releases/download/v0.6.1/ta-lib-0.6.1-src.tar.gz -O /tmp/ta-lib.tar.gz && \
    cd /tmp && tar -xzf ta-lib.tar.gz && \
    cd ta-lib-0.6.1 && \
    ./configure --prefix=/usr && make -j$(nproc) && make install && \
    rm -rf /tmp/ta-lib* && \
    apt-get remove -y build-essential wget && \
    apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple && \
    rm -rf /root/.cache

COPY app/ ./app/
COPY lib/ ./lib/

EXPOSE 8003

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8003"]
