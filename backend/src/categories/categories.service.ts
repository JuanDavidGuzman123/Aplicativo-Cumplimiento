import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CounterpartyStatus } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service.js'
import { DEFAULT_CATEGORY_KEY } from './category.constants.js'

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const [categories, counts] = await this.prisma.$transaction([
      this.prisma.category.findMany({
        where: { active: true },
        select: {
          id: true,
          key: true,
          name: true,
          active: true,
          sortOrder: true,
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.counterparty.groupBy({
        by: ['categoryId', 'status'],
        _count: { _all: true },
      }),
    ])

    return categories.map((category) => {
      const activeCount = this.countFor(
        counts,
        category.id,
        CounterpartyStatus.ACTIVE,
      )
      const archivedCount = this.countFor(
        counts,
        category.id,
        CounterpartyStatus.ARCHIVED,
      )

      return {
        id: category.id,
        key: category.key,
        name: category.name,
        active: category.active,
        sortOrder: category.sortOrder,
        activeCount,
        archivedCount,
        totalCount: activeCount + archivedCount,
      }
    })
  }

  async resolveId(key?: string): Promise<string> {
    const resolvedKey = key?.trim() || DEFAULT_CATEGORY_KEY
    const category = await this.prisma.category.findUnique({
      where: { key: resolvedKey },
      select: { id: true, active: true },
    })

    if (!category || !category.active) {
      throw new BadRequestException(
        'La categoría seleccionada no está disponible',
      )
    }

    return category.id
  }

  async getDefaultId(): Promise<string> {
    const category = await this.prisma.category.findUnique({
      where: { key: DEFAULT_CATEGORY_KEY },
      select: { id: true },
    })

    if (!category) {
      throw new NotFoundException(
        'No hay una categoría predeterminada configurada',
      )
    }

    return category.id
  }

  private countFor(
    counts: {
      categoryId: string
      status: CounterpartyStatus
      _count: { _all: number }
    }[],
    categoryId: string,
    status: CounterpartyStatus,
  ): number {
    return (
      counts.find(
        (entry) =>
          entry.categoryId === categoryId && entry.status === status,
      )?._count._all ?? 0
    )
  }
}
