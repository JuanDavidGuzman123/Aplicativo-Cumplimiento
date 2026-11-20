import { api } from './api'
import type { User, UserRole } from '../types/user'

export type CreateUserInput = {
  name: string
  email: string
  password: string
  role: UserRole
}

export type UpdateUserInput = {
  name?: string
  role?: UserRole
}

export async function getUsers(): Promise<User[]> {
  const { data } = await api.get<User[]>('/users')
  return data
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const { data } = await api.post<User>('/users', input)
  return data
}

export async function updateUser(
  id: string,
  input: UpdateUserInput,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}`, input)
  return data
}

export async function updateUserStatus(
  id: string,
  active: boolean,
): Promise<User> {
  const { data } = await api.patch<User>(`/users/${id}/status`, { active })
  return data
}
