FROM python:3.11-slim

WORKDIR /app

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null || \
    (echo "deb http://mirrors.aliyun.com/debian/ bookworm main" > /etc/apt/sources.list && \
     echo "deb http://mirrors.aliyun.com/debian/ bookworm-updates main" >> /etc/apt/sources.list)

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential wget && \
    wget -q https://mirrors.aliyun.com/gentoo/distfiles/ta-lib-0.4.0-src.tar.gz -O ta-lib.tar.gz || \
    wget -q http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz -O ta-lib.tar.gz && \
    tar -xzf ta-lib.tar.gz && \
    cd ta-lib-0.4.0 && ./configure --quiet && make -s && make install && \
    cd .. && rm -rf ta-lib-0.4.0 ta-lib.tar.gz && \
    ldconfig && \
    apt-get purge -y build-essential wget && \
    rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple

COPY app/ ./app/

EXPOSE 8002
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
