export type UserRole = 'ADMIN' | 'ANALYST'

export type User = {
  id: string
  name: string
  email: string
  role: UserRole
  active: boolean
  createdAt?: string
  updatedAt?: string
}
