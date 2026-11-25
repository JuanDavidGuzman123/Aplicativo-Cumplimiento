import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import { CounterpartyStatus } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../prisma/prisma.service.js'
import { DEFAULT_CATEGORY_KEY } from './category.constants.js'
import { CategoriesService } from './categories.service.js'

type PrismaMock = {
  $transaction: ReturnType<typeof vi.fn>
  category: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  counterparty: {
    groupBy: ReturnType<typeof vi.fn>
  }
}

function createPrismaMock(): PrismaMock {
  return {
    $transaction: vi.fn((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    ),
    category: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    counterparty: {
      groupBy: vi.fn(),
    },
  }
}

function createService(prisma: PrismaMock) {
  return new CategoriesService(
    prisma as unknown as PrismaService,
  )
}

describe('CategoriesService', () => {
  let prisma: PrismaMock
  let service: CategoriesService

  beforeEach(() => {
    prisma = createPrismaMock()
    service = createService(prisma)
  })

  it('returns active categories with active, archived and missing counts', async () => {
    prisma.category.findMany.mockResolvedValue([
      {
        id: 'category-1',
        key: 'ARRIENDOS',
        name: 'Arriendos',
        active: true,
        sortOrder: 1,
      },
      {
        id: 'category-2',
        key: 'CLIENTES',
        name: 'Clientes',
        active: true,
        sortOrder: 2,
      },
      {
        id: 'category-3',
        key: 'VACIOS',
        name: 'Vacios',
        active: true,
        sortOrder: 3,
      },
    ])
    prisma.counterparty.groupBy.mockResolvedValue([
      {
        categoryId: 'category-1',
        status: CounterpartyStatus.ACTIVE,
        _count: { _all: 4 },
      },
      {
        categoryId: 'category-1',
        status: CounterpartyStatus.ARCHIVED,
        _count: { _all: 2 },
      },
      {
        categoryId: 'category-2',
        status: CounterpartyStatus.ACTIVE,
        _count: { _all: 1 },
      },
    ])

    const result = await service.findAll()

    expect(result).toEqual([
      {
        id: 'category-1',
        key: 'ARRIENDOS',
        name: 'Arriendos',
        active: true,
        sortOrder: 1,
        activeCount: 4,
        archivedCount: 2,
        totalCount: 6,
      },
      {
        id: 'category-2',
        key: 'CLIENTES',
        name: 'Clientes',
        active: true,
        sortOrder: 2,
        activeCount: 1,
        archivedCount: 0,
        totalCount: 1,
      },
      {
        id: 'category-3',
        key: 'VACIOS',
        name: 'Vacios',
        active: true,
        sortOrder: 3,
        activeCount: 0,
        archivedCount: 0,
        totalCount: 0,
      },
    ])
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { active: true },
      select: {
        id: true,
        key: true,
        name: true,
        active: true,
        sortOrder: true,
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    })
    expect(prisma.counterparty.groupBy).toHaveBeenCalledWith({
      by: ['categoryId', 'status'],
      _count: { _all: true },
    })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it.each([undefined, '', '   '])(
    'uses the default category key for %s',
    async (key) => {
      prisma.category.findUnique.mockResolvedValue({
        id: 'category-default',
        active: true,
      })

      const result = await service.resolveId(key)

      expect(result).toBe('category-default')
      expect(prisma.category.findUnique).toHaveBeenCalledWith({
        where: { key: DEFAULT_CATEGORY_KEY },
        select: { id: true, active: true },
      })
    },
  )

  it('trims the category key before resolving it', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-clientes',
      active: true,
    })

    const result = await service.resolveId('  CLIENTES  ')

    expect(result).toBe('category-clientes')
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { key: 'CLIENTES' },
      select: { id: true, active: true },
    })
  })

  it('rejects a category that does not exist', async () => {
    prisma.category.findUnique.mockResolvedValue(null)

    await expect(
      service.resolveId('MISSING'),
    ).rejects.toThrow(BadRequestException)
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { key: 'MISSING' },
      select: { id: true, active: true },
    })
  })

  it('rejects an inactive category', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-inactive',
      active: false,
    })

    await expect(
      service.resolveId('INACTIVE'),
    ).rejects.toThrow(BadRequestException)
  })

  it('returns the default category id', async () => {
    prisma.category.findUnique.mockResolvedValue({
      id: 'category-default',
    })

    const result = await service.getDefaultId()

    expect(result).toBe('category-default')
    expect(prisma.category.findUnique).toHaveBeenCalledWith({
      where: { key: DEFAULT_CATEGORY_KEY },
      select: { id: true },
    })
  })

  it('throws when the default category is missing', async () => {
    prisma.category.findUnique.mockResolvedValue(null)

    await expect(service.getDefaultId()).rejects.toThrow(
      NotFoundException,
    )
  })
})
