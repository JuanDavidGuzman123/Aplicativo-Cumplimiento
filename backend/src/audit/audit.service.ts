import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ListAuditQueryDto } from './dto/list-audit-query.dto.js';

export type AuditRecord = {
  userId?: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  details?: Prisma.InputJsonValue;
};

const auditSelect = {
  id: true,
  action: true,
  entity: true,
  entityId: true,
  details: true,
  createdAt: true,
  user: {
    select: { id: true, name: true, email: true },
  },
} satisfies Prisma.AuditLogSelect;

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListAuditQueryDto) {
    const page = query.page;
    const pageSize = query.pageSize;
    const where: Prisma.AuditLogWhereInput = {};

    if (query.entity) {
      where.entity = { contains: query.entity, mode: 'insensitive' };
    }

    if (query.action) {
      where.action = { contains: query.action, mode: 'insensitive' };
    }

    if (query.userId) {
      where.userId = query.userId;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        select: auditSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data: rows,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  async record(entry: AuditRecord): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: entry.userId ?? null,
          action: entry.action,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          details: entry.details,
        },
      });
    } catch (error) {
      this.logger.error(
        'No fue posible registrar el evento de auditoría',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
