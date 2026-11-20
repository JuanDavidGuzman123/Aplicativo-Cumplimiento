import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'
import { UserRole } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'
import { RolesGuard } from './roles.guard.js'

function createContext(role?: UserRole): ExecutionContext {
  return {
    getHandler: vi.fn(),
    getClass: vi.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        user: role
          ? {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'Usuario',
              email: 'usuario@example.com',
              role,
            }
          : undefined,
      }),
    }),
  } as unknown as ExecutionContext
}

describe('RolesGuard', () => {
  it('allows routes without role restrictions', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue(undefined),
    } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    expect(guard.canActivate(createContext(UserRole.ANALYST))).toBe(
      true,
    )
  })

  it('allows users with an accepted role', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    expect(guard.canActivate(createContext(UserRole.ADMIN))).toBe(true)
  })

  it('rejects users with another role or without authentication', () => {
    const reflector = {
      getAllAndOverride: vi.fn().mockReturnValue([UserRole.ADMIN]),
    } as unknown as Reflector
    const guard = new RolesGuard(reflector)

    expect(
      guard.canActivate(createContext(UserRole.ANALYST)),
    ).toBe(false)
    expect(guard.canActivate(createContext())).toBe(false)
  })
})
