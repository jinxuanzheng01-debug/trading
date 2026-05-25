# Trading Agent

量化分析平台 - Monorepo

## 结构

```
trading-agent/
├── frontend/       # Nuxt 4 前端
├── backend/        # Hono 后端 (TypeScript)
└── services/       # Python 服务（后续添加）
    └── backtest/   # 回测服务
```

## 开发

```bash
# 安装依赖
pnpm install

# 启动前端
pnpm dev

# 启动后端
pnpm dev:api

# 同时启动前后端
pnpm dev:all
```
