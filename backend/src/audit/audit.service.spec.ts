import { describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../prisma/prisma.service.js'
import { AuditService } from './audit.service.js'

describe('AuditService.findAll', () => {
  it('filters, paginates and returns audit entries', async () => {
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        action: 'USER_CREATED',
        entity: 'User',
        entityId: '22222222-2222-2222-2222-222222222222',
        details: { email: 'analista@example.com' },
        createdAt: new Date('2026-11-06T15:00:00.000Z'),
        user: {
          id: '33333333-3333-3333-3333-333333333333',
          name: 'Administrador',
          email: 'admin@example.com',
        },
      },
    ]

    const findMany = vi.fn().mockResolvedValue(rows)
    const count = vi.fn().mockResolvedValue(21)
    const prisma = {
      auditLog: { findMany, count },
      $transaction: vi.fn((operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    }
    const service = new AuditService(
      prisma as unknown as PrismaService,
    )
    const userId = '33333333-3333-3333-3333-333333333333'

    const result = await service.findAll({
      entity: 'User',
      action: 'CREATED',
      userId,
      page: 2,
      pageSize: 20,
    })

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          entity: { contains: 'User', mode: 'insensitive' },
          action: { contains: 'CREATED', mode: 'insensitive' },
          userId,
        },
        skip: 20,
        take: 20,
      }),
    )
    expect(result).toEqual({
      data: rows,
      meta: {
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      },
    })
  })
})
