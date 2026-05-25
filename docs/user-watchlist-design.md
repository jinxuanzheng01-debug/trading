# 用户系统与自选功能设计

## 一、功能范围

### MVP 功能列表
| 功能 | 描述 | 优先级 |
|------|------|--------|
| 邮箱注册/登录 | 邮箱+密码，含验证码 | P0 |
| Google OAuth | 一键登录 | P0 |
| 自选分组 | 创建/重命名/删除分组 | P0 |
| 添加自选 | 搜索添加股票/币种 | P0 |
| 自选列表 | 展示自选标的，支持排序 | P0 |
| 删除自选 | 从分组移除 | P0 |

### 暂不做
- 手机号登录
- 微信登录
- 自选拖拽排序（后续迭代）
- 导入/导出自选

---

## 二、数据库设计

```sql
-- 用户表
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- OAuth用户可为NULL
    oauth_provider VARCHAR(50),   -- 'google' / NULL
    oauth_id VARCHAR(255),        -- OAuth用户ID
    display_name VARCHAR(100),
    avatar_url VARCHAR(500),
    preferences JSONB DEFAULT '{"theme": "system", "language": "zh-CN"}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 自选分组表
CREATE TABLE watchlist_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'star',  -- star/trending/chart等emoji
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 自选标的表
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,
    symbol VARCHAR(50) NOT NULL,      -- BTC/USD/AAPL等
    exchange VARCHAR(20),             -- binance/nyse等
    name VARCHAR(255),                -- 显示名称
    type VARCHAR(20) DEFAULT 'crypto', -- crypto/stock/index
    sort_order INT DEFAULT 0,
    notes TEXT,                       -- 用户备注
    added_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(group_id, symbol, COALESCE(exchange, ''))
);

-- 索引
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_watchlist_groups_user ON watchlist_groups(user_id);
CREATE INDEX idx_watchlist_items_group ON watchlist_items(group_id);
CREATE INDEX idx_watchlist_items_symbol ON watchlist_items(symbol, exchange);
```

---

## 三、API 接口设计

### 认证相关
```
POST   /api/auth/register     - 邮箱注册
POST   /api/auth/login        - 邮箱登录
POST   /api/auth/logout       - 登出
GET    /api/auth/me           - 获取当前用户
GET    /api/auth/google       - Google OAuth入口
GET    /api/auth/google/callback - OAuth回调
```

### 自选分组
```
GET    /api/watchlist/groups          - 获取所有分组
POST   /api/watchlist/groups          - 创建分组
PUT    /api/watchlist/groups/:id      - 更新分组（名称/图标）
DELETE /api/watchlist/groups/:id      - 删除分组
```

### 自选标的
```
GET    /api/watchlist/items           - 获取所有自选
GET    /api/watchlist/groups/:id/items - 获取某分组下的自选
POST   /api/watchlist/items           - 添加自选
DELETE /api/watchlist/items/:id       - 删除自选
PUT    /api/watchlist/items/:id       - 更新自选（排序/备注）
```

### 标的搜索（用于添加自选时搜索）
```
GET    /api/search/symbols?q={query}  - 搜索股票/币种
```

---

## 四、前端页面设计

### 页面结构
```
├── pages/
│   ├── index.vue              # 首页（自选列表）
│   ├── login.vue              # 登录页
│   └── register.vue           # 注册页
├── components/
│   ├── watchlist/
│   │   ├── WatchlistSidebar.vue    # 分组侧边栏
│   │   ├── WatchlistGrid.vue       # 自选网格展示
│   │   ├── AddSymbolDialog.vue     # 添加标的弹窗
│   │   └── SymbolCard.vue          # 单个标的卡片
│   └── auth/
│       ├── LoginForm.vue           # 登录表单
│       └── RegisterForm.vue        # 注册表单
```

### 首页布局（未登录）
```
┌─────────────────────────────────────────────────┐
│                    Logo                          │
├─────────────────────────────────────────────────┤
│                                                  │
│            [ 登录 ] [ 注册 ]                      │
│                                                  │
│           👋 欢迎使用量化分析平台                 │
│           开始追踪你的投资标的                    │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 首页布局（已登录）
```
┌──────────────────────────────────────────────────────────────┐
│  Logo                    搜索框                    用户头像  │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────┐  ┌──────────────────────────────────────────┐  │
│  │ 分组    │  │                                          │  │
│  │         │  │  ┌──────┐ ┌──────┐ ┌──────┐             │  │
│  │ 📁 全部 │  │  │ BTC  │ │ AAPL │ │ 腾讯 │             │  │
│  │ 📁 股票 │  │  │      │ │      │ │      │             │  │
│  │ 📁 币圈 │  │  │ +5%  │ │ -2%  │ │ +1%  │             │  │
│  │         │  │  └──────┘ └──────┘ └──────┘             │  │
│  │ + 新建  │  │                                          │  │
│  └─────────┘  └──────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

## 五、实现计划

### Step 1: 数据库与认证基础 (2-3天)
- [ ] PostgreSQL 数据库创建
- [ ] 用户表创建
- [ ] JWT 认证中间件
- [ ] 注册/登录 API

### Step 2: 自选分组功能 (2天)
- [ ] 分组表创建
- [ ] 分组 CRUD API
- [ ] 前端分组管理界面

### Step 3: 自选标的功能 (3天)
- [ ] 自选表创建
- [ ] 添加/删除自选 API
- [ ] 前端自选列表展示
- [ ] 搜索添加标的功能

### Step 4: Google OAuth (1-2天)
- [ ] OAuth 配置
- [ ] 回调处理
- [ ] 前端集成

---

*创建日期: 2026-05-20*
