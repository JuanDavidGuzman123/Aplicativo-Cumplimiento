import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { CreateSubprocessDto } from './dto/create-subprocess.dto.js'
import { UpdateSubprocessDto } from './dto/update-subprocess.dto.js'

const subprocessSelect = {
  id: true,
  name: true,
  description: true,
  active: true,
  createdAt: true,
  _count: { select: { counterparties: true } },
} satisfies Prisma.SubprocessSelect

@Injectable()
export class SubprocessesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.subprocess.findMany({
      select: subprocessSelect,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    })
  }

  async create(dto: CreateSubprocessDto, actorId: string) {
    const name = dto.name.trim()
    await this.ensureNameAvailable(name)

    const subprocess = await this.prisma.subprocess.create({
      data: {
        name,
        description: dto.description ?? null,
      },
      select: subprocessSelect,
    })

    await this.audit.record({
      userId: actorId,
      action: 'SUBPROCESS_CREATED',
      entity: 'Subprocess',
      entityId: subprocess.id,
      details: { name: subprocess.name },
    })

    return subprocess
  }

  async update(id: string, dto: UpdateSubprocessDto, actorId: string) {
    if (
      dto.name === undefined &&
      dto.description === undefined &&
      dto.active === undefined
    ) {
      throw new BadRequestException(
        'No se enviaron cambios para actualizar',
      )
    }

    const current = await this.prisma.subprocess.findUnique({
      where: { id },
      select: subprocessSelect,
    })

    if (!current) {
      throw new NotFoundException('Subproceso no encontrado')
    }

    if (dto.name !== undefined) {
      await this.ensureNameAvailable(dto.name, id)
    }

    const subprocess = await this.prisma.subprocess.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
      select: subprocessSelect,
    })

    await this.audit.record({
      userId: actorId,
      action: 'SUBPROCESS_UPDATED',
      entity: 'Subprocess',
      entityId: subprocess.id,
      details: {
        changes: {
          name: dto.name,
          description: dto.description,
          active: dto.active,
        },
      },
    })

    return subprocess
  }

  private async ensureNameAvailable(
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.subprocess.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    })

    if (existing) {
      throw new ConflictException(
        'Ya existe un subproceso con ese nombre',
      )
    }
  }
}
