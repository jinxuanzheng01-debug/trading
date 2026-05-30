export type UserRole = 'admin' | 'user'

export interface UserInfo {
  id: number
  email: string
  username: string
  role: UserRole
}
