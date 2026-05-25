# 用户系统与自选功能实现方案 v2

## 变更说明
- **移动端**：只考虑移动端网页（响应式设计），不做原生App
- **注册方式**：管理员分配账号，不提供自主注册
- **登录方式**：仅用户名+密码

---

## 一、数据库设计

### 1.1 用户表 (users)

```sql
CREATE TABLE users (
    -- 主键
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 认证信息
    username VARCHAR(50) UNIQUE NOT NULL,     -- 用户名（登录用）
    password_hash VARCHAR(255) NOT NULL,      -- 密码哈希

    -- 个人信息
    display_name VARCHAR(100) NOT NULL,       -- 显示名称
    avatar_url VARCHAR(500),

    -- 角色与状态
    role VARCHAR(20) DEFAULT 'user',          -- 'admin' / 'user'
    is_active BOOLEAN DEFAULT TRUE,

    -- 设置
    preferences JSONB DEFAULT '{
        "theme": "system",
        "language": "zh-CN"
    }'::jsonb,

    -- 管理信息
    created_by UUID REFERENCES users(id),    -- 创建者（管理员）
    notes TEXT,                                -- 管理员备注

    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX idx_users_username ON users(username) WHERE is_active = TRUE;
CREATE INDEX idx_users_role ON users(role);

-- 触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 1.2 自选分组表 (watchlist_groups)

```sql
CREATE TABLE watchlist_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT 'star',
    color VARCHAR(20),

    sort_order INT DEFAULT 0,
    is_default BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_watchlist_groups_user ON watchlist_groups(user_id, sort_order);
CREATE TRIGGER update_watchlist_groups_updated_at BEFORE UPDATE ON watchlist_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 1.3 自选标的表 (watchlist_items)

```sql
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,

    symbol VARCHAR(50) NOT NULL,
    exchange VARCHAR(20),
    name VARCHAR(255),
    type VARCHAR(20) DEFAULT 'crypto',

    notes TEXT,
    alert_high DECIMAL(20,8),
    alert_low DECIMAL(20,8),

    sort_order INT DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_symbol_in_group UNIQUE (group_id, symbol, COALESCE(exchange, ''))
);

CREATE INDEX idx_watchlist_items_group ON watchlist_items(group_id, sort_order);
CREATE INDEX idx_watchlist_items_symbol ON watchlist_items(symbol, exchange);
```

### 1.4 初始化管理员账号

```sql
-- 创建默认管理员 (用户名: admin, 密码: admin123)
INSERT INTO users (username, password_hash, display_name, role, is_active)
VALUES (
    'admin',
    '$2b$10$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', -- bcrypt hash of 'admin123'
    '管理员',
    'admin',
    TRUE
);
```

---

## 二、API 接口设计

### 2.1 认证模块

#### POST /api/auth/login - 登录

**请求**
```json
{
  "username": "admin",
  "password": "password"
}
```

**响应 200**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "displayName": "管理员",
      "role": "admin"
    },
    "token": "jwt_token"
  }
}
```

#### POST /api/auth/logout - 登出

**响应 200**
```json
{
  "success": true
}
```

#### GET /api/auth/me - 获取当前用户

**响应 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "admin",
    "displayName": "管理员",
    "role": "admin",
    "preferences": {...}
  }
}
```

---

### 2.2 管理员模块 (Admin Only)

#### GET /api/admin/users - 获取用户列表

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "username": "zhangsan",
      "displayName": "张三",
      "role": "user",
      "isActive": true,
      "lastLoginAt": "2026-05-20T00:00:00Z",
      "createdAt": "2026-05-01T00:00:00Z"
    }
  ]
}
```

#### POST /api/admin/users - 创建用户

**请求**
```json
{
  "username": "lisi",
  "password": "initialPass123",
  "displayName": "李四",
  "notes": "VIP用户"
}
```

**响应 201**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "lisi",
    "displayName": "李四",
    "role": "user"
  }
}
```

#### PUT /api/admin/users/:id - 更新用户

**请求**
```json
{
  "displayName": "李四四",
  "isActive": true
}
```

#### DELETE /api/admin/users/:id - 删除用户

#### POST /api/admin/users/:id/reset-password - 重置密码

**请求**
```json
{
  "newPassword": "newPass123"
}
```

---

### 2.3 自选分组模块

#### GET /api/watchlist/groups - 获取分组列表

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "默认分组",
      "icon": "star",
      "color": null,
      "sortOrder": 0,
      "isDefault": true,
      "itemCount": 5
    }
  ]
}
```

#### POST /api/watchlist/groups - 创建分组

**请求**
```json
{
  "name": "加密货币",
  "icon": "trending",
  "color": "green"
}
```

#### PUT /api/watchlist/groups/:id - 更新分组

#### DELETE /api/watchlist/groups/:id - 删除分组

---

### 2.4 自选标的模块

#### GET /api/watchlist/items - 获取自选列表

**查询参数**
- `groupId` (可选) - 筛选分组
- `type` (可选) - 筛选类型

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "groupId": "uuid",
      "symbol": "BTC",
      "exchange": "binance",
      "name": "Bitcoin",
      "type": "crypto",
      "notes": null,
      "sortOrder": 0,
      "addedAt": "2026-05-20T00:00:00Z"
    }
  ]
}
```

#### POST /api/watchlist/items - 添加自选

**请求**
```json
{
  "groupId": "uuid",
  "symbol": "ETH",
  "exchange": "binance",
  "name": "Ethereum",
  "type": "crypto"
}
```

#### DELETE /api/watchlist/items/:id - 删除自选

#### PUT /api/watchlist/items/:id - 更新自选

---

### 2.5 标的搜索

#### GET /api/search/symbols - 搜索标的

**查询参数**
- `q` - 搜索关键词
- `type` - crypto/stock/all
- `limit` - 返回数量，默认10

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "symbol": "BTC",
      "name": "Bitcoin",
      "type": "crypto",
      "exchange": "binance"
    }
  ]
}
```

---

## 三、前端设计（移动端优先）

### 3.1 页面结构

```
pages/
├── index.vue                    # 首页（自选列表）
└── login.vue                    # 登录页

components/
├── auth/
│   └── LoginForm.vue            # 登录表单
│
├── watchlist/
│   ├── MobileHeader.vue         # 移动端顶部栏
│   ├── GroupTabs.vue            # 分组标签页
│   ├── SymbolList.vue           # 自选列表
│   ├── SymbolCard.vue           # 单个标的卡片
│   ├── AddGroupDialog.vue       # 新建分组弹窗
│   └── AddSymbolDialog.vue      # 添加标的弹窗
│
└── admin/
    ├── UserList.vue             # 用户列表（管理员）
    ├── CreateUserDialog.vue     # 创建用户弹窗
    └── UserMenu.vue             # 用户操作菜单
```

### 3.2 移动端布局设计

#### 登录页
```
┌─────────────────────────────┐
│                             │
│         📊                  │
│    量化分析平台              │
│                             │
│  ┌─────────────────────┐   │
│  │  用户名             │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │  密码        👁      │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │       登 录         │   │
│  └─────────────────────┘   │
│                             │
└─────────────────────────────┘
```

#### 首页（已登录）
```
┌─────────────────────────────┐
│ ☰  量化分析平台      👤    │ ← 顶部栏
├─────────────────────────────┤
│                             │
│  ┌─────┬─────┬─────┬─────┐│ ← 分组标签
│  │全部 │股票 │币圈 │ ... ││
│  └─────┴─────┴─────┴─────┘│
│                             │
│  ┌─────────────────────┐   │
│  │ BTC  Bitcoin        │   │
│  │      $65,000 +2.5%  │   │ ← 标的卡片
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ ETH  Ethereum       │   │
│  │      $3,500 +1.8%   │   │
│  └─────────────────────┘   │
│                             │
│  ┌─────────────────────┐   │
│  │ AAPL Apple Inc.     │   │
│  │      $189 -0.5%     │   │
│  └─────────────────────┘   │
│                             │
├─────────────────────────────┤
│  🏠   📊   ➕              │ ← 底部导航
└─────────────────────────────┘
```

### 3.3 核心组件设计

#### LoginForm.vue

```vue
<template>
  <div class="login-page">
    <div class="login-container">
      <div class="logo">📊</div>
      <h1>量化分析平台</h1>

      <form @submit.prevent="handleLogin" class="login-form">
        <UFormGroup label="用户名" :error="errors.username">
          <UInput
            v-model="username"
            type="text"
            placeholder="请输入用户名"
            size="lg"
            autocomplete="username"
          />
        </UFormGroup>

        <UFormGroup label="密码" :error="errors.password">
          <UInput
            v-model="password"
            type="password"
            placeholder="请输入密码"
            size="lg"
            autocomplete="current-password"
          />
        </UFormGroup>

        <UAlert
          v-if="error"
          icon="i-heroicons-exclamation-triangle"
          color="red"
          :title="error"
        />

        <UButton
          type="submit"
          size="lg"
          block
          :loading="loading"
        >
          登录
        </UButton>
      </form>
    </div>
  </div>
</template>
```

#### GroupTabs.vue（分组标签）

```vue
<template>
  <div class="group-tabs">
    <div class="tabs-scroll">
      <button
        v-for="group in groups"
        :key="group.id"
        class="tab-item"
        :class="{ active: group.id === activeGroupId }"
        @click="$emit('select', group.id)"
      >
        <span class="tab-icon">{{ group.icon }}</span>
        <span class="tab-name">{{ group.name }}</span>
      </button>
    </div>
    <UButton
      icon="i-heroicons-plus"
      variant="ghost"
      size="sm"
      @click="showAddDialog = true"
    />
  </div>
</template>
```

#### SymbolCard.vue（标的卡片）

```vue
<template>
  <div class="symbol-card" @click="$emit('click', item)">
    <div class="card-left">
      <div class="symbol-info">
        <span class="symbol">{{ item.symbol }}</span>
        <span class="exchange">{{ item.exchange }}</span>
      </div>
      <div class="name">{{ item.name }}</div>
    </div>

    <div class="card-right">
      <!-- 价格信息（暂无数据时显示占位） -->
      <div class="price">
        <span class="value">--</span>
        <span class="change">--%</span>
      </div>
      <UButton
        icon="i-heroicons-x-mark"
        variant="ghost"
        color="red"
        size="sm"
        @click.stop="$emit('remove', item.id)"
      />
    </div>
  </div>
</template>

<style scoped>
.symbol-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: var(--ui-bg);
  border-radius: 12px;
  margin-bottom: 8px;
  cursor: pointer;
}
</style>
```

---

## 四、项目目录结构

```
trading-agent/
├── components/
│   ├── auth/
│   │   └── LoginForm.vue
│   ├── watchlist/
│   │   ├── MobileHeader.vue
│   │   ├── GroupTabs.vue
│   │   ├── SymbolList.vue
│   │   ├── SymbolCard.vue
│   │   ├── AddGroupDialog.vue
│   │   └── AddSymbolDialog.vue
│   └── admin/
│       ├── UserList.vue
│       ├── CreateUserDialog.vue
│       └── UserMenu.vue
├── composables/
│   ├── useAuth.ts
│   ├── useWatchlist.ts
│   └── useSearchSymbols.ts
├── pages/
│   ├── index.vue
│   └── login.vue
├── server/
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.post.ts
│   │   │   ├── logout.post.ts
│   │   │   └── me.get.ts
│   │   ├── admin/
│   │   │   └── users/
│   │   │       ├── index.get.ts
│   │   │       ├── index.post.ts
│   │   │       ├── [id].put.ts
│   │   │       ├── [id].delete.ts
│   │   │       └── [id]/reset-password.post.ts
│   │   ├── watchlist/
│   │   │   ├── groups/
│   │   │   │   ├── index.get.ts
│   │   │   │   ├── index.post.ts
│   │   │   │   └── [id].delete.ts
│   │   │   └── items/
│   │   │       ├── index.get.ts
│   │   │       ├── index.post.ts
│   │   │       └── [id].delete.ts
│   │   └── search/
│   │       └── symbols.get.ts
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── admin.service.ts
│   │   └── watchlist.service.ts
│   ├── db/
│   │   ├── client.ts
│   │   └── schema.sql
│   ├── middleware/
│   │   └── auth.ts
│   └── utils/
│       ├── jwt.ts
│       └── crypto.ts
├── stores/
│   ├── auth.ts
│   └── watchlist.ts
├── types/
│   ├── auth.ts
│   ├── watchlist.ts
│   └── api.ts
├── nuxt.config.ts
├── tailwind.config.js
└── package.json
```

---

## 五、类型定义

```typescript
// types/auth.ts
export interface User {
  id: string
  username: string
  displayName: string
  role: 'admin' | 'user'
  isActive: boolean
  lastLoginAt: string | null
}

export interface LoginRequest {
  username: string
  password: string
}

// types/admin.ts
export interface CreateUserRequest {
  username: string
  password: string
  displayName: string
  notes?: string
}

// types/watchlist.ts
export interface WatchlistGroup {
  id: string
  name: string
  icon: string
  sortOrder: number
  isDefault: boolean
  itemCount: number
}

export interface WatchlistItem {
  id: string
  groupId: string
  symbol: string
  exchange: string | null
  name: string
  type: 'crypto' | 'stock'
  notes: string | null
  sortOrder: number
}
```

---

## 六、关键代码框架

### 6.1 认证服务

```typescript
// server/services/auth.service.ts
export class AuthService {
  async login(username: string, password: string) {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1)

    if (!user) {
      throw new Error('INVALID_CREDENTIALS')
    }

    const isValid = await verify(password, user.passwordHash)
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS')
    }

    if (!user.isActive) {
      throw new Error('ACCOUNT_DISABLED')
    }

    // 更新最后登录
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))

    const token = await signJWT({
      sub: user.id,
      username: user.username,
      role: user.role
    })

    return { user, token }
  }
}
```

### 6.2 管理员服务

```typescript
// server/services/admin.service.ts
export class AdminService {
  async listUsers() {
    return db.select({
      id: users.id,
      username: users.username,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt
    }).from(users).orderBy(desc(users.createdAt))
  }

  async createUser(data: CreateUserRequest) {
    const passwordHash = await hash(data.password)

    const [user] = await db.insert(users)
      .values({
        username: data.username,
        passwordHash,
        displayName: data.displayName,
        role: 'user',
        isActive: true
      })
      .returning()

    return user
  }

  async deleteUser(userId: string) {
    await db.delete(users)
      .where(eq(users.id, userId))
  }

  async resetPassword(userId: string, newPassword: string) {
    const passwordHash = await hash(newPassword)

    await db.update(users)
      .set({ passwordHash })
      .where(eq(users.id, userId))
  }
}
```

### 6.3 Store

```typescript
// stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)

  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(username: string, password: string) {
    const response = await $fetch<APIResponse<{ user: User, token: string }>>(
      '/api/auth/login',
      { method: 'POST', body: { username, password } }
    )
    user.value = response.data.user
    token.value = response.data.token
  }

  return { user, token, isAdmin, login }
})
```

---

## 七、移动端适配要点

### 7.1 视口设置
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

### 7.2 触摸优化
```css
/* 按钮最小点击区域 44x44 */
.button {
  min-height: 44px;
  min-width: 44px;
}

/* 去除点击高亮 */
* {
  -webkit-tap-highlight-color: transparent;
}
```

### 7.3 滚动优化
```css
/* 平滑滚动 */
.scroll-container {
  scroll-behavior: smooth;
  -webkit-overflow-scrolling: touch;
}
```

---

## 八、实施步骤（简化版约8-10天）

| 阶段 | 内容 | 工期 |
|------|------|------|
| Phase 1 | 基础设施 + 数据库 | 2天 |
| Phase 2 | 登录功能 | 1天 |
| Phase 3 | 自选分组 CRUD | 2天 |
| Phase 4 | 自选标的 CRUD | 2天 |
| Phase 5 | 管理员功能 | 1天 |
| Phase 6 | 移动端 UI 优化 | 1-2天 |

---

*文档版本: v2.0*
*创建日期: 2026-05-20*
*变更: 移除注册/OAuth，专注移动端网页*
