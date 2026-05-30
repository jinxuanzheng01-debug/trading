# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Trading Agent 是一个量化分析平台，使用 pnpm workspace 构建的 monorepo 项目。这是一个全栈 TypeScript 应用，前端使用 Nuxt 4，后端使用 Hono，面向散户投资者提供 AI 辅助的市场分析功能。

## Monorepo 结构

```
trading-agent/
├── web/                    # 前端项目
│   └── admin/              # Nuxt 4 管理面板 (端口 3000)
│
├── api/                    # 后端项目
│   └── business/           # Hono 业务 API (端口 3002)
│
├── services/               # Python 微服务
│   ├── market-data/        # 行情数据服务 (FastAPI, 端口 8000)
│   ├── scheduler/          # 定时任务服务 (FastAPI, 端口 8001)
│   └── backtest/           # 回测服务
│
├── agents/                 # voltagent.dev agents
├── mcp/                    # MCP 服务器
│   └── servers/
├── shared/                 # 共享代码
│   ├── types/
│   └── utils/
├── infra/                  # 基础设施
│   └── docker/
├── scripts/                # 自动化脚本
└── docs/                   # 文档
```

## 开发命令

### 根目录命令（在项目根目录执行）：
```bash
# 安装所有依赖
pnpm install

# 仅启动前端 (http://localhost:3000)
pnpm dev

# 仅启动后端 (http://localhost:3002)
pnpm dev:api

# 同时启动前后端
pnpm dev:all

# 构建所有包
pnpm build

# 检查所有包
pnpm lint
```

### 数据库命令（后端）：
```bash
# 根据 schema 变更生成迁移文件
pnpm db:generate

# 应用迁移到数据库
pnpm db:migrate

# 直接推送 schema（开发环境用，跳过迁移文件）
pnpm db:push

# 打开 Drizzle Studio 可视化数据库
pnpm db:studio
```

### 启动服务（docker-compose）：
```bash
# 启动所有服务 (PostgreSQL, Redis, Adminer, api, market-data, scheduler, web)
docker compose up -d

# 仅启动基础设施服务
docker compose up postgres redis adminer redis-commander -d

# 查看服务状态
docker compose ps

# 查看服务日志
docker compose logs -f [service-name]
```

## 架构说明

### 前端 (web/admin - Nuxt 4)
- **框架**: Nuxt 4 + Vue 3 Composition API
- **UI**: shadcn-vue 组件库 + TailwindCSS 4
- **状态管理**: Pinia 全局状态，composables 封装领域逻辑
- **认证**: JWT 方式，token/user 存储在 cookie 中，有效期 7 天
- **API 地址**: 通过环境变量配置 (`NUXT_PUBLIC_API_BASE`, `NUXT_PUBLIC_MARKET_DATA_API_BASE`)

关键目录：
- `composables/` - 领域逻辑 hooks（useAuth, useWatchlist）
- `components/` - Vue 组件（watchlist/, auth/, ui/）
- `pages/` - 基于文件的路由
- `middleware/` - 路由守卫（auth 中间件保护非公开路由）

### 后端 (api/business - Hono)
- **框架**: Hono + `@hono/node-server`
- **数据库**: PostgreSQL 16 + Drizzle ORM
- **认证**: JWT 签名算法 HS256，有效期 7 天
- **密码**: bcryptjs 加密

关键目录：
- `src/routes/` - API 路由处理器（auth.ts, watchlist.ts）
- `src/db/` - 数据库客户端、schema、迁移
- `src/lib/` - 工具函数（jwt.ts, password.ts）
- `src/middleware/` - Hono 中间件（auth.ts）

### 数据库 Schema
核心表定义在 `api/business/src/db/schema.ts`：
- `users` - 用户账户，支持角色（admin/user）
- `watchlist_groups` - 用户的自选分组
- `watchlist_items` - 分组内的具体标的

启用了级联删除：删除分组会删除其下标的；删除用户会删除其所有数据。

### 认证流程
1. 登录：`POST /api/auth/login` → 返回 `{ user, token }`
2. 前端将 token/user 存入 cookie
3. 受保护的路由携带 `Authorization: Bearer {token}` 请求头
4. 后端 `authMiddleware` 验证 JWT 并通过 `c.set('user', payload)` 注入用户信息
5. 前端路由中间件检查 `isAuthenticated`，未登录则重定向到 `/login`

### API 路由规范
```typescript
// 后端路由遵循 REST 规范
GET    /api/watchlist/groups       # 获取分组列表
POST   /api/watchlist/groups       # 创建分组
PUT    /api/watchlist/groups/:id   # 更新分组
DELETE /api/watchlist/groups/:id   # 删除分组

GET    /api/watchlist/groups/:id/items  # 获取指定分组的标的
```

## 技术栈详情

- **包管理器**: pnpm（支持 workspace）
- **TypeScript**: 所有包启用严格模式
- **数据库**: PostgreSQL（计划使用 TimescaleDB 存储时序数据）
- **代码检查**: ESLint（前端用 Antfu config，后端标准 TypeScript）
- **样式**: TailwindCSS 4 + shadcn-vue 组件

## 重要注意事项

1. **暂无测试** - 项目目前没有测试基础设施
2. **管理员账户** - 初始管理员账户通过数据库 seed 创建
3. **CORS 源** - 后端允许 localhost:3000, :3001, :3002
4. **JWT 密钥** - 生产环境需修改 `JWT_SECRET` 环境变量
5. **数据库地址** - 默认为 `postgresql://admin:admin123@localhost:5432/trading_agent`

## Docker 调试指南

### 代码修改后必须重新构建镜像

**重要**: 修改代码后，**必须**重新构建 Docker 镜像，`docker compose restart` 不会应用代码修改。

```bash
# 只修改了前端代码
docker compose build web && docker compose up -d web

# 只修改了后端代码
docker compose build api && docker compose up -d api

# 修改了多个服务
docker compose build web api market-data && docker compose up -d web api market-data

# 重新构建所有服务
docker compose build && docker compose up -d
```

### 常见调试步骤

1. **检查服务状态**
   ```bash
   docker compose ps
   ```

2. **查看服务日志**
   ```bash
   # 查看所有服务日志
   docker compose logs

   # 查看特定服务日志
   docker compose logs -f api
   docker compose logs -f market-data
   docker compose logs -f web
   ```

3. **重启所有服务**
   ```bash
   docker compose restart
   ```

4. **完全重建**
   ```bash
   # 停止并删除容器
   docker compose down

   # 重新构建并启动
   docker compose build
   docker compose up -d
   ```

5. **进入容器调试**
   ```bash
   # 进入 API 容器
   docker exec -it trading-agent-api sh

   # 进入数据库容器
   docker exec -it trading-agent-db psql -U admin -d trading_agent
   ```

### 网络问题排查

如果容器间无法通信：

1. 检查容器是否在同一网络：
   ```bash
   docker network inspect trading-agent_trading-net
   ```

2. 检查环境变量是否正确：
   ```bash
   docker exec trading-agent-api env | grep MARKET_DATA
   # 应该显示: MARKET_DATA_API_BASE=http://market-data:8000
   ```

3. 从容器内测试连接：
   ```bash
   docker exec trading-agent-api wget -q -O- http://market-data:8000/api/health
   ```

## 微服务架构

### market-data 服务 (端口 8000)
- **框架**: FastAPI + Python 3.11
- **数据源**: yfinance (美股/港股), AkShare (A股)
- **缓存**: Redis (30s TTL for quotes, 5min for K-lines)
- **数据库**: TimescaleDB 存储历史K线

### scheduler 服务 (端口 8001)
- **框架**: FastAPI + APScheduler
- **事件驱动**: 通过 Redis Streams 接收 watchlist 变更事件
- **任务**: 自动同步用户自选标的的K线数据

### ta-engine 服务 (端口 8003)
- **框架**: FastAPI + Python 3.11
- **指标计算**: TA-Lib（150+ 技术指标 + 61 个 K线形态识别）
- **因子系统**: 19 个标准算子（ts_mean, delta, rank, ts_corr 等），15 个时序因子
- **策略引擎**: 4 个信号引擎（趋势跟踪 / 动量反转 / 量价分析 / 形态识别），纯算法评分
- **数据访问**: 通过 market-data API 获取 K-line 数据，不直连数据库
- **设计文档**: `docs/specs/2026-05-30-technical-analysis-design.md`
- **重要**: 此服务不包含 LLM，纯确定性计算。LLM 分析在 VoltAgent 服务（services/agent/）中

## 未来服务

`services/` 目录可扩展更多 Python 微服务：
- `backtest/` - 策略回测服务（FastAPI + TA-Lib）

## agents 目录

用于 voltagent.dev agent 项目：
```
agents/
└── [agent-name]/
    ├── agent/          # voltagent agent config
    ├── tools/          # Agent tools
    ├── prompts/        # Prompt templates
    └── tests/          # Agent tests
```

## mcp 目录

用于 MCP (Model Context Protocol) 服务器：
```
mcp/
└── servers/
    ├── trading-agent/     # 主 MCP 服务
    ├── market-data/       # 市场数据 MCP 工具
    └── backtest/          # 回测 MCP 工具
```

## MVP 实施阶段

1. Phase 1: 基础架子（已完成）
2. Phase 2: 用户认证系统（已完成）
3. Phase 3: 自选分组（已完成）
4. Phase 4: 自选标的及搜索
5. Phase 5: 管理员用户管理
