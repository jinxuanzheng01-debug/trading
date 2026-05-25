# MVP 实施计划 v3

## 变更说明
- **前端**: Nuxt 4 + NuxtUI (基于 nuxt-shadcn-dashboard 模板)
- **后端**: Hono (业务逻辑) + PostgreSQL
- **移动端**: 响应式设计，不做原生 App
- **用户系统**: 管理员分配账号，用户名+密码登录

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Nuxt 4 |
| UI 组件 | NuxtUI / Shadcn Vue |
| 样式 | TailwindCSS 4 |
| 后端框架 | Hono |
| 数据库 | PostgreSQL + Drizzle ORM |
| 认证 | JWT |
| 开发工具 | Claude Code + MCP (Nuxt + Shadcn) |

---

## MVP Phase 1: 基础架子 (2-3天)

### 目标
跑通前后端基础架构，能跑起来一个 Hello World

### 任务清单
- [ ] 初始化 Nuxt 4 项目（使用 nuxt-shadcn-dashboard 模板）
- [ ] 清理不需要的 dashboard 组件
- [ ] 配置移动端响应式
- [ ] 创建 Hono 后端服务
- [ ] 配置 PostgreSQL + Drizzle ORM
- [ ] 前后端联通测试

### 验收标准
- 前端能访问 `http://localhost:3000`
- 后端 API 能访问 `http://localhost:3001/api/hello`
- 数据库连接正常
- 一个简单的 API 调用返回数据

---

## MVP Phase 2: 用户系统 (2-3天)

### 目标
完成用户登录功能

### 任务清单
- [ ] 创建 users 表（username, password_hash, display_name, role）
- [ ] 实现密码哈希/验证工具
- [ ] JWT 签发/验证中间件
- [ ] 登录 API (`POST /api/auth/login`)
- [ ] 登出 API (`POST /api/auth/logout`)
- [ ] 获取当前用户 API (`GET /api/auth/me`)
- [ ] 前端登录页面（移动端适配）
- [ ] 前端认证状态管理（Pinia）

### API 设计
```
POST /api/auth/login
{
  "username": "admin",
  "password": "password"
}
→ { "user": {...}, "token": "jwt" }

GET /api/auth/me
Header: Authorization: Bearer {token}
→ { "user": {...} }
```

### 验收标准
- 能用管理员账号登录
- 登录后跳转到首页
- 刷新页面保持登录状态
- 未登录访问首页重定向到登录页

---

## MVP Phase 3: 自选分组 (2天)

### 目标
用户能创建和管理自选分组

### 任务清单
- [ ] 创建 watchlist_groups 表
- [ ] 分组 CRUD API
- [ ] 前端分组管理组件
- [ ] 分组标签切换

### API 设计
```
GET  /api/watchlist/groups     # 获取所有分组
POST /api/watchlist/groups     # 创建分组
PUT  /api/watchlist/groups/:id # 更新分组
DELETE /api/watchlist/groups/:id # 删除分组
```

### 验收标准
- 能创建/重命名/删除分组
- 分组列表实时更新
- 切换分组显示对应内容

---

## MVP Phase 4: 自选标的 (2-3天)

### 目标
用户能添加和管理自选标的

### 任务清单
- [ ] 创建 watchlist_items 表
- [ ] 自选 CRUD API
- [ ] 标的搜索 API（先用静态数据）
- [ ] 前端自选列表组件
- [ ] 添加标的弹窗

### API 设计
```
GET    /api/watchlist/items           # 获取自选列表
POST   /api/watchlist/items           # 添加自选
DELETE /api/watchlist/items/:id       # 删除自选

GET    /api/search/symbols?q=BTC      # 搜索标的
```

### 验收标准
- 能添加/删除自选
- 自选列表显示正确
- 搜索功能可用

---

## MVP Phase 5: 管理员功能 (1天)

### 目标
管理员能管理用户账号

### 任务清单
- [ ] 用户列表 API
- [ ] 创建用户 API
- [ ] 重置密码 API
- [ ] 前端用户管理页面（仅管理员可见）

### API 设计
```
GET    /api/admin/users              # 用户列表
POST   /api/admin/users              # 创建用户
POST   /api/admin/users/:id/reset-password  # 重置密码
```

---

## 项目结构

```
trading-agent/
├── frontend/                 # Nuxt 前端
│   ├── components/
│   │   ├── auth/
│   │   └── watchlist/
│   ├── composables/
│   ├── pages/
│   │   ├── index.vue
│   │   └── login.vue
│   ├── stores/
│   └── nuxt.config.ts
│
├── backend/                  # Hono 后端
│   ├── src/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── watchlist.ts
│   │   │   └── admin.ts
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   └── schema.ts
│   │   └── index.ts
│   ├── package.json
│   └── tsconfig.json
│
├── docker-compose.yml        # PostgreSQL
└── README.md
```

---

## Hono 后端配置

```typescript
// backend/src/index.ts
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { authRoutes } from './routes/auth'
import { watchlistRoutes } from './routes/watchlist'

const app = new Hono()

// 中间件
app.use('*', cors())
app.use('*', logger())

// 路由
app.route('/api/auth', authRoutes)
app.route('/api/watchlist', watchlistRoutes)

// 健康检查
app.get('/api/health', (c) => c.json({ status: 'ok' }))

export default app
```

---

## 总工期: 9-12天

| Phase | 内容 | 工期 |
|-------|------|------|
| Phase 1 | 基础架子 | 2-3天 |
| Phase 2 | 用户系统 | 2-3天 |
| Phase 3 | 自选分组 | 2天 |
| Phase 4 | 自选标的 | 2-3天 |
| Phase 5 | 管理员功能 | 1天 |

---

*文档版本: v3.0*
*创建日期: 2026-05-20*
