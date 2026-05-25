# 用户系统与自选功能详细实现方案

## 目录
- [一、数据库设计](#一数据库设计)
- [二、API 接口详细设计](#二api-接口详细设计)
- [三、前端组件设计](#三前端组件设计)
- [四、认证流程设计](#四认证流程设计)
- [五、项目目录结构](#五项目目录结构)
- [六、关键代码框架](#六关键代码框架)

---

## 一、数据库设计

### 1.1 用户表 (users)

```sql
CREATE TABLE users (
    -- 主键
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- 认证信息
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),              -- bcrypt哈希，OAuth用户为NULL
    oauth_provider VARCHAR(50),               -- 'google', 'github', NULL
    oauth_id VARCHAR(255),                    -- OAuth提供商的用户ID

    -- 个人信息
    display_name VARCHAR(100),                -- 显示名称
    avatar_url VARCHAR(500),                  -- 头像URL

    -- 设置
    preferences JSONB DEFAULT '{
        "theme": "system",
        "language": "zh-CN",
        "defaultGroup": null
    }'::jsonb,

    -- 状态
    is_active BOOLEAN DEFAULT TRUE,
    is_verified BOOLEAN DEFAULT FALSE,        -- 邮箱是否验证
    email_verified_at TIMESTAMPTZ,

    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 索引
CREATE INDEX idx_users_email ON users(email) WHERE is_active = TRUE;
CREATE INDEX idx_users_oauth ON users(oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

-- 触发器：自动更新 updated_at
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
    icon VARCHAR(50) DEFAULT 'star',           -- emoji: star, trending, chart, alert
    color VARCHAR(20),                         -- 分组颜色: blue, green, red, etc.

    sort_order INT DEFAULT 0,                  -- 排序权重
    is_default BOOLEAN DEFAULT FALSE,          -- 是否为默认分组

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT one_default_per_user UNIQUE (user_id, is_default) WHERE is_default = TRUE
);

-- 索引
CREATE INDEX idx_watchlist_groups_user ON watchlist_groups(user_id, sort_order);

-- 触发器
CREATE TRIGGER update_watchlist_groups_updated_at BEFORE UPDATE ON watchlist_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 1.3 自选标的表 (watchlist_items)

```sql
CREATE TABLE watchlist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES watchlist_groups(id) ON DELETE CASCADE,

    -- 标的信息
    symbol VARCHAR(50) NOT NULL,               -- BTC, AAPL, 00700.HK
    exchange VARCHAR(20),                      -- binance, nyse, hkex
    name VARCHAR(255),                         -- 显示名称
    type VARCHAR(20) DEFAULT 'crypto',         -- crypto, stock, index, etf

    -- 用户自定义
    notes TEXT,                                -- 备注
    tags VARCHAR(100)[],                       -- 标签数组
    alert_high DECIMAL(20,8),                  -- 价格提醒上限
    alert_low DECIMAL(20,8),                   -- 价格提醒下限

    sort_order INT DEFAULT 0,
    added_at TIMESTAMPTZ DEFAULT NOW(),

    -- 确保同一分组下不会有重复标的
    CONSTRAINT unique_symbol_in_group UNIQUE (group_id, symbol, COALESCE(exchange, ''))
);

-- 索引
CREATE INDEX idx_watchlist_items_group ON watchlist_items(group_id, sort_order);
CREATE INDEX idx_watchlist_items_symbol ON watchlist_items(symbol, exchange);

-- 评论
COMMENT ON COLUMN watchlist_items.symbol IS '标的代码，如 BTC, AAPL, 00700.HK';
COMMENT ON COLUMN watchlist_items.exchange IS '交易所代码，如 binance, nyse, hkex，加密货币必填';
COMMENT ON COLUMN watchlist_items.type IS '类型: crypto(加密货币), stock(股票), index(指数), etf(基金)';
```

### 1.4 初始化数据

```sql
-- 创建默认图标选项
-- star: ⭐, trending: 📈, chart: 📊, alert: 🔔, money: 💰
```

---

## 二、API 接口详细设计

### 2.1 认证模块

#### POST /api/auth/register - 邮箱注册

**请求**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "displayName": "张三"
}
```

**响应 201**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "displayName": "张三",
      "avatarUrl": null,
      "isVerified": false
    },
    "token": "jwt_token_here"
  }
}
```

**响应 400** - 邮箱已存在
```json
{
  "success": false,
  "error": {
    "code": "EMAIL_EXISTS",
    "message": "该邮箱已被注册"
  }
}
```

#### POST /api/auth/login - 邮箱登录

**请求**
```json
{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**响应 200**
```json
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "jwt_token_here"
  }
}
```

#### GET /api/auth/me - 获取当前用户

**请求头**
```
Authorization: Bearer {token}
```

**响应 200**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "张三",
    "avatarUrl": "https://...",
    "preferences": {
      "theme": "system",
      "language": "zh-CN"
    },
    "createdAt": "2026-05-20T00:00:00Z"
  }
}
```

#### POST /api/auth/logout - 登出

**响应 200**
```json
{
  "success": true,
  "message": "登出成功"
}
```

---

### 2.2 自选分组模块

#### GET /api/watchlist/groups - 获取所有分组

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "我的股票",
      "icon": "star",
      "color": "blue",
      "sortOrder": 0,
      "isDefault": true,
      "itemCount": 5,
      "createdAt": "2026-05-20T00:00:00Z"
    },
    {
      "id": "uuid",
      "name": "加密货币",
      "icon": "trending",
      "color": "green",
      "sortOrder": 1,
      "isDefault": false,
      "itemCount": 3,
      "createdAt": "2026-05-20T00:00:00Z"
    }
  ]
}
```

#### POST /api/watchlist/groups - 创建分组

**请求**
```json
{
  "name": "美股关注",
  "icon": "chart",
  "color": "purple"
}
```

**响应 201**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "美股关注",
    "icon": "chart",
    "color": "purple",
    "sortOrder": 2,
    "isDefault": false,
    "itemCount": 0,
    "createdAt": "2026-05-20T00:00:00Z"
  }
}
```

#### PUT /api/watchlist/groups/:id - 更新分组

**请求**
```json
{
  "name": "美股精选",
  "icon": "trending"
}
```

**响应 200**
```json
{
  "success": true,
  "data": { /* 更新后的分组数据 */ }
}
```

#### DELETE /api/watchlist/groups/:id - 删除分组

**响应 200**
```json
{
  "success": true,
  "message": "分组已删除"
}
```

**注意**: 删除分组时，分组下的所有自选项也会被级联删除。

---

### 2.3 自选标的管理

#### GET /api/watchlist/items - 获取所有自选

**查询参数**
- `groupId` (可选) - 筛选指定分组
- `type` (可选) - 筛选类型: crypto, stock
- `search` (可选) - 搜索标的名称

**响应 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "groupId": "uuid",
      "groupName": "加密货币",
      "symbol": "BTC",
      "exchange": "binance",
      "name": "Bitcoin",
      "type": "crypto",
      "notes": "长期持有",
      "tags": ["长期", "主力"],
      "alertHigh": 80000,
      "alertLow": 60000,
      "sortOrder": 0,
      "addedAt": "2026-05-20T00:00:00Z",
      // 以下为扩展信息（非持久化）
      "currentPrice": null,
      "change24h": null
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
  "type": "crypto",
  "notes": "智能合约平台"
}
```

**响应 201**
```json
{
  "success": true,
  "data": { /* 创建的自选项数据 */ }
}
```

**响应 400** - 重复添加
```json
{
  "success": false,
  "error": {
    "code": "ALREADY_EXISTS",
    "message": "该标的已在自选中"
  }
}
```

#### DELETE /api/watchlist/items/:id - 删除自选

**响应 200**
```json
{
  "success": true,
  "message": "已从自选移除"
}
```

#### PUT /api/watchlist/items/:id - 更新自选

**请求**
```json
{
  "notes": "更新备注",
  "alertHigh": 100000,
  "alertLow": 50000
}
```

**响应 200**
```json
{
  "success": true,
  "data": { /* 更新后的自选项数据 */ }
}
```

---

### 2.4 标的搜索

#### GET /api/search/symbols - 搜索标的

**查询参数**
- `q` - 搜索关键词
- `type` - 类型筛选: crypto, stock, all
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
      "exchange": "binance",
      "icon": "₿"
    },
    {
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "type": "stock",
      "exchange": "nasdaq",
      "icon": "🍎"
    }
  ]
}
```

---

## 三、前端组件设计

### 3.1 组件层次结构

```
pages/
├── index.vue                    # 首页（自选列表）
├── login.vue                    # 登录页
└── register.vue                 # 注册页

components/
├── auth/
│   ├── LoginForm.vue            # 登录表单
│   ├── RegisterForm.vue         # 注册表单
│   └── OAuthButton.vue          # OAuth登录按钮
│
├── watchlist/
│   ├── WatchlistSidebar.vue     # 分组侧边栏
│   ├── WatchlistContent.vue     # 自选内容区
│   ├── WatchlistGrid.vue        # 自选网格展示
│   ├── WatchlistList.vue        # 自选列表展示
│   ├── SymbolCard.vue           # 单个标的卡片
│   ├── AddGroupDialog.vue       # 新建分组弹窗
│   ├── EditGroupDialog.vue      # 编辑分组弹窗
│   └── AddSymbolDialog.vue      # 添加标的弹窗
│
└── common/
    ├── AppHeader.vue            # 顶部导航
    ├── UserMenu.vue             # 用户菜单
    └── SearchInput.vue          # 搜索框
```

### 3.2 核心组件设计

#### LoginForm.vue

**Props**
```typescript
interface Props {
  redirectUrl?: string  // 登录成功后跳转地址
}
```

**Emits**
```typescript
interface Emits {
  (e: 'success', user: User): void
  (e: 'register-click'): void
}
```

**状态**
```typescript
interface State {
  email: string
  password: string
  loading: boolean
  error: string | null
}
```

**模板结构**
```vue
<template>
  <div class="login-form">
    <h2>登录</h2>
    <UFormGroup label="邮箱" :error="errors.email">
      <UInput v-model="email" type="email" placeholder="your@email.com" />
    </UFormGroup>

    <UFormGroup label="密码" :error="errors.password">
      <UInput v-model="password" type="password" />
    </UFormGroup>

    <UButton @click="handleLogin" :loading="loading" block>
      登录
    </UButton>

    <div class="oauth-section">
      <UDivider label="或" />
      <OAuthButton provider="google" @success="handleOAuthSuccess" />
    </div>

    <p class="register-hint">
      还没有账号？ <Ulink @click="$emit('register-click')">立即注册</Ulink>
    </p>
  </div>
</template>
```

---

#### WatchlistSidebar.vue

**Props**
```typescript
interface Props {
  groups: WatchlistGroup[]      // 分组列表
  activeGroupId: string | null  // 当前选中的分组
  loading?: boolean
}
```

**Emits**
```typescript
interface Emits {
  (e: 'select-group', groupId: string | null): void
  (e: 'create-group', data: CreateGroupData): void
  (e: 'update-group', groupId: string, data: UpdateGroupData): void
  (e: 'delete-group', groupId: string): void
}
```

**模板结构**
```vue
<template>
  <div class="watchlist-sidebar">
    <!-- 分组列表 -->
    <div class="group-list">
      <div
        v-for="group in groups"
        :key="group.id"
        class="group-item"
        :class="{ active: group.id === activeGroupId }"
        @click="$emit('select-group', group.id)"
      >
        <span class="group-icon">{{ group.icon }}</span>
        <span class="group-name">{{ group.name }}</span>
        <span class="group-count">{{ group.itemCount }}</span>

        <!-- 分组操作菜单 -->
        <UDropdown :items="getGroupMenuItems(group)">
          <UButton icon="i-heroicons-ellipsis-vertical" variant="ghost" />
        </UDropdown>
      </div>
    </div>

    <!-- 新建分组按钮 -->
    <UButton
      icon="i-heroicons-plus"
      variant="ghost"
      block
      @click="showCreateDialog = true"
    >
      新建分组
    </UButton>

    <!-- 新建分组弹窗 -->
    <AddGroupDialog v-model:open="showCreateDialog" @confirm="handleCreateGroup" />
  </div>
</template>
```

---

#### SymbolCard.vue

**Props**
```typescript
interface Props {
  item: WatchlistItem
  removable?: boolean
}
```

**Emits**
```typescript
interface Emits {
  (e: 'remove', itemId: string): void
  (e: 'click', item: WatchlistItem): void
}
```

**模板结构**
```vue
<template>
  <div class="symbol-card" @click="$emit('click', item)">
    <div class="card-header">
      <div class="symbol-info">
        <span class="symbol">{{ item.symbol }}</span>
        <span class="exchange">{{ item.exchange }}</span>
      </div>
      <UBadge :color="getTypeColor(item.type)">
        {{ getTypeLabel(item.type) }}
      </UBadge>
    </div>

    <div class="card-body">
      <p class="name">{{ item.name }}</p>
      <p v-if="item.notes" class="notes">{{ item.notes }}</p>
    </div>

    <div class="card-footer">
      <!-- 价格信息（暂无数据时显示占位） -->
      <div class="price-info">
        <span class="price">--</span>
        <span class="change">--%</span>
      </div>

      <!-- 删除按钮 -->
      <UButton
        v-if="removable"
        icon="i-heroicons-trash"
        variant="ghost"
        color="red"
        size="sm"
        @click.stop="handleRemove"
      />
    </div>
  </div>
</template>
```

---

#### AddSymbolDialog.vue

**Props**
```typescript
interface Props {
  open: boolean
  groupId: string  // 添加到哪个分组
}
```

**Emits**
```typescript
interface Emits {
  (e: 'update:open', value: boolean): void
  (e: 'add', data: AddSymbolData): void
}
```

**状态**
```typescript
interface State {
  searchQuery: string
  searching: boolean
  searchResults: Symbol[] | null
  selectedSymbol: Symbol | null
  // 表单
  notes: string
}
```

---

### 3.3 页面设计

#### index.vue - 首页

**布局逻辑**
```vue
<template>
  <div class="home-page">
    <!-- 未登录状态 -->
    <div v-if="!user" class="landing">
      <h1>量化分析平台</h1>
      <p>用 AI 降低投资门槛</p>
      <div class="cta-buttons">
        <UButton to="/login" size="lg">登录</UButton>
        <UButton to="/register" variant="outline" size="lg">注册</UButton>
      </div>
    </div>

    <!-- 已登录状态 -->
    <AppLayout v-else>
      <template #sidebar>
        <WatchlistSidebar
          :groups="groups"
          :active-group-id="activeGroupId"
          @select-group="handleSelectGroup"
          @create-group="handleCreateGroup"
        />
      </template>

      <template #default>
        <WatchlistContent
          :group-id="activeGroupId"
          :items="currentItems"
          :loading="itemsLoading"
        />
      </template>
    </AppLayout>
  </div>
</template>
```

---

## 四、认证流程设计

### 4.1 JWT Token 设计

**Token Payload**
```typescript
interface JWTPayload {
  sub: string      // 用户ID
  email: string    // 用户邮箱
  iat: number      // 签发时间
  exp: number      // 过期时间 (7天)
}
```

**Token 存储**
- HttpOnly Cookie (推荐，防XSS)
- 或 localStorage + CSRF保护

### 4.2 认证中间件

```typescript
// server/api/middleware/auth.ts
export default defineEventHandler((event) => {
  const token = getCookie(event, 'auth_token') ||
                getHeader(event, 'authorization')?.replace('Bearer ', '')

  if (!token) {
    throw createError({
      statusCode: 401,
      message: '未登录'
    })
  }

  try {
    const payload = await verifyJWT(token)
    event.context.user = payload
  } catch {
    throw createError({
      statusCode: 401,
      message: 'Token无效'
    })
  }
})
```

### 4.3 Google OAuth 流程

```
1. 用户点击 "Google 登录"
   ↓
2. 前端跳转到 /api/auth/google
   ↓
3. 后端重定向到 Google OAuth 页面
   ↓
4. 用户在 Google 页面授权
   ↓
5. Google 回调 /api/auth/google/callback?code=xxx
   ↓
6. 后端用 code 换取 access_token
   ↓
7. 用 access_token 获取用户信息
   ↓
8. 查找或创建用户记录
   ↓
9. 生成 JWT，设置 Cookie
   ↓
10. 重定向回前端
```

---

## 五、项目目录结构

```
trading-agent/
├── components/              # Vue组件
│   ├── auth/
│   ├── watchlist/
│   └── common/
├── composables/             # 组合式函数
│   ├── useAuth.ts          # 认证相关
│   ├── useWatchlist.ts     # 自选相关
│   └── useSearchSymbols.ts # 搜索标的
├── pages/                   # 页面
│   ├── index.vue
│   ├── login.vue
│   └── register.vue
├── server/                   # 后端代码
│   ├── api/
│   │   ├── auth/
│   │   │   ├── login.post.ts
│   │   │   ├── register.post.ts
│   │   │   ├── logout.post.ts
│   │   │   └── me.get.ts
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
│   │   ├── watchlist.service.ts
│   │   └── user.service.ts
│   ├── db/
│   │   ├── client.ts       # PostgreSQL客户端
│   │   └── schema.sql      # 数据库结构
│   ├── middleware/
│   │   └── auth.ts         # 认证中间件
│   └── utils/
│       ├── jwt.ts          # JWT工具
│       └── crypto.ts       # 密码哈希
├── stores/                  # Pinia状态
│   ├── auth.ts             # 认证状态
│   ├── watchlist.ts        # 自选状态
│   └── ui.ts               # UI状态
├── types/                   # TypeScript类型
│   ├── auth.ts
│   ├── watchlist.ts
│   └── api.ts
├── nuxt.config.ts           # Nuxt配置
├── package.json
└── README.md
```

---

## 六、关键代码框架

### 6.1 类型定义

```typescript
// types/auth.ts
export interface User {
  id: string
  email: string
  displayName: string | null
  avatarUrl: string | null
  preferences: UserPreferences
  isActive: boolean
  isVerified: boolean
  createdAt: string
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  language: string
  defaultGroup: string | null
}

export interface LoginRequest {
  email: string
  password: string
}

export interface RegisterRequest {
  email: string
  password: string
  displayName?: string
}

export interface AuthResponse {
  user: User
  token: string
}
```

```typescript
// types/watchlist.ts
export interface WatchlistGroup {
  id: string
  userId: string
  name: string
  icon: string
  color: string | null
  sortOrder: number
  isDefault: boolean
  itemCount: number
  createdAt: string
}

export interface WatchlistItem {
  id: string
  groupId: string
  groupName?: string
  symbol: string
  exchange: string | null
  name: string
  type: 'crypto' | 'stock' | 'index' | 'etf'
  notes: string | null
  tags: string[]
  alertHigh: number | null
  alertLow: number | null
  sortOrder: number
  addedAt: string
  // 扩展信息（非持久化）
  currentPrice?: number | null
  change24h?: number | null
}

export type SymbolType = 'crypto' | 'stock' | 'index' | 'etf'

export interface Symbol {
  symbol: string
  name: string
  type: SymbolType
  exchange: string
  icon?: string
}
```

### 6.2 Pinia Store

```typescript
// stores/auth.ts
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(null)
  const loading = ref(false)

  const isAuthenticated = computed(() => !!user.value)

  async function login(credentials: LoginRequest) {
    loading.value = true
    try {
      const response = await $fetch<APIResponse<AuthResponse>>(
        '/api/auth/login',
        {
          method: 'POST',
          body: credentials
        }
      )
      user.value = response.data.user
      token.value = response.data.token
      return response.data
    } finally {
      loading.value = false
    }
  }

  async function register(data: RegisterRequest) {
    loading.value = true
    try {
      const response = await $fetch<APIResponse<AuthResponse>>(
        '/api/auth/register',
        {
          method: 'POST',
          body: data
        }
      )
      user.value = response.data.user
      token.value = response.data.token
      return response.data
    } finally {
      loading.value = false
    }
  }

  async function fetchMe() {
    const token = getCookie('auth_token')
    if (!token) return

    try {
      const response = await $fetch<APIResponse<User>>(
        '/api/auth/me'
      )
      user.value = response.data
    } catch {
      await logout()
    }
  }

  async function logout() {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    token.value = null
  }

  return {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    register,
    fetchMe,
    logout
  }
})
```

```typescript
// stores/watchlist.ts
export const useWatchlistStore = defineStore('watchlist', () => {
  const groups = ref<WatchlistGroup[]>([])
  const items = ref<WatchlistItem[]>([])
  const activeGroupId = ref<string | null>(null)
  const loading = ref(false)

  const activeItems = computed(() =>
    activeGroupId.value
      ? items.value.filter(i => i.groupId === activeGroupId.value)
      : items.value
  )

  async function fetchGroups() {
    loading.value = true
    try {
      const response = await $fetch<APIResponse<WatchlistGroup[]>>(
        '/api/watchlist/groups'
      )
      groups.value = response.data
    } finally {
      loading.value = false
    }
  }

  async function fetchItems(groupId?: string) {
    const params = groupId ? { groupId } : {}
    const response = await $fetch<APIResponse<WatchlistItem[]>>(
      '/api/watchlist/items',
      { params }
    )
    items.value = response.data
  }

  async function createGroup(data: CreateGroupData) {
    const response = await $fetch<APIResponse<WatchlistGroup>>(
      '/api/watchlist/groups',
      { method: 'POST', body: data }
    )
    groups.value.push(response.data)
    return response.data
  }

  async function addItem(data: AddItemData) {
    const response = await $fetch<APIResponse<WatchlistItem>>(
      '/api/watchlist/items',
      { method: 'POST', body: data }
    )
    items.value.push(response.data)
    return response.data
  }

  async function removeItem(itemId: string) {
    await $fetch(`/api/watchlist/items/${itemId}`, {
      method: 'DELETE'
    })
    items.value = items.value.filter(i => i.id !== itemId)
  }

  return {
    groups,
    items,
    activeGroupId,
    activeItems,
    loading,
    fetchGroups,
    fetchItems,
    createGroup,
    addItem,
    removeItem
  }
})
```

### 6.3 数据库服务

```typescript
// server/db/client.ts
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL!

const client = postgres(connectionString, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10
})

export const db = drizzle(client)
```

```typescript
// server/services/auth.service.ts
import { db } from '~/server/db/client'
import { users } from '~/server/db/schema'
import { eq } from 'drizzle-orm'
import { hash, verify } from '~/server/utils/crypto'
import { signJWT } from '~/server/utils/jwt'

export class AuthService {
  async register(email: string, password: string, displayName?: string) {
    // 检查邮箱是否存在
    const existing = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (existing.length > 0) {
      throw new Error('EMAIL_EXISTS')
    }

    // 创建用户
    const passwordHash = await hash(password)
    const [user] = await db.insert(users)
      .values({
        email,
        passwordHash,
        displayName: displayName || email.split('@')[0]
      })
      .returning()

    const token = await signJWT({ sub: user.id, email: user.email })

    return { user, token }
  }

  async login(email: string, password: string) {
    const [user] = await db.select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    if (!user || !user.passwordHash) {
      throw new Error('INVALID_CREDENTIALS')
    }

    const isValid = await verify(password, user.passwordHash)
    if (!isValid) {
      throw new Error('INVALID_CREDENTIALS')
    }

    // 更新最后登录时间
    await db.update(users)
      .set({ lastLoginAt: new Date() })
      .where(eq(users.id, user.id))

    const token = await signJWT({ sub: user.id, email: user.email })

    return { user, token }
  }
}
```

---

## 七、实施步骤

### Phase 1: 基础设施 (2天)
- [x] 详细设计文档
- [ ] 初始化 Nuxt 4 项目
- [ ] 配置 PostgreSQL 数据库
- [ ] 配置 Drizzle ORM
- [ ] 创建数据库表结构

### Phase 2: 认证模块 (3天)
- [ ] JWT 工具函数
- [ ] 密码哈希工具
- [ ] 认证服务
- [ ] 注册/登录 API
- [ ] 认证中间件
- [ ] 前端登录/注册页面

### Phase 3: 自选分组 (2天)
- [ ] 分组 CRUD API
- [ ] 分组服务
- [ ] 前端分组组件
- [ ] 分组管理界面

### Phase 4: 自选标的 (3天)
- [ ] 自选 CRUD API
- [ ] 自选服务
- [ ] 搜索标的 API（先用静态数据）
- [ ] 前端自选组件
- [ ] 添加/删除自选界面

### Phase 5: 集成测试 (1-2天)
- [ ] 端到端测试
- [ ] UI 优化
- [ ] 错误处理完善

---

*文档版本: v1.0*
*创建日期: 2026-05-20*
