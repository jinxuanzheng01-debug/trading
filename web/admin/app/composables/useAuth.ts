export interface User {
  id: number
  email: string
  username: string
  role: string
}

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'auth_user'

/** 业务错误类 - 用于统一响应处理 */
export class BusinessError extends Error {
  code: number
  constructor(msg: string, code: number) {
    super(msg)
    this.name = 'BusinessError'
    this.code = code
  }
}

export function useAuth() {
  const config = useRuntimeConfig()
  const token = useCookie(TOKEN_KEY, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })
  const user = useCookie<User | null>(USER_KEY, {
    default: () => null,
    maxAge: 60 * 60 * 24 * 7, // 7 days
  })

  const isAuthenticated = computed(() => !!token.value)

  async function login(email: string, password: string) {
    const response = await $fetch<{ user: User; token: string }>(
      `${config.public.apiBase}/api/auth/login`,
      {
        method: 'POST',
        body: { email, password },
      },
    )

    token.value = response.token
    user.value = response.user

    return response
  }

  async function register(email: string, username: string, password: string) {
    const response = await $fetch<{ user: User; token: string }>(
      `${config.public.apiBase}/api/auth/register`,
      {
        method: 'POST',
        body: { email, username, password },
      },
    )

    token.value = response.token
    user.value = response.user

    return response
  }

  function logout() {
    token.value = null
    user.value = null
    navigateTo('/login', { replace: true })
  }

  async function fetchWithAuth<T>(url: string, options?: RequestInit): Promise<T> {
    if (!token.value) {
      throw new Error('Not authenticated')
    }

    const res = await $fetch<{ code: number; msg: string; data: T }>(url, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token.value}`,
      },
    })

    // 统一响应解包：code !== 0 为业务错误
    if (res.code !== 0) {
      throw new BusinessError(res.msg || '请求失败', res.code)
    }

    return res.data as T
  }

  return {
    token: readonly(token),
    user: readonly(user),
    isAuthenticated,
    login,
    register,
    logout,
    fetchWithAuth,
  }
}
