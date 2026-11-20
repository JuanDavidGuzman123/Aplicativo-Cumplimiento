import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CounterpartyStatus, Prisma } from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import {
  calculateCalendarStatus,
} from '../common/utils/calendar-status.js'
import {
  addDays,
  addMonths,
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from '../common/utils/dates.js'
import { normalizeNit } from '../common/utils/nit.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { CounterpartyActionDto, ReactivateCounterpartyDto } from './dto/counterparty-action.dto.js'
import { CreateCounterpartyDto } from './dto/create-counterparty.dto.js'
import { ListCounterpartiesQueryDto } from './dto/list-counterparties-query.dto.js'
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto.js'

const listSelect = {
  id: true,
  nit: true,
  businessName: true,
  status: true,
  registrationDate: true,
  lastFollowUpDate: true,
  nextFollowUpDate: true,
  subprocess: {
    select: { id: true, name: true, active: true },
  },
} satisfies Prisma.CounterpartySelect

const detailSelect = {
  ...listSelect,
  observations: true,
  archivedAt: true,
  archiveReason: true,
  archivedBy: { select: { id: true, name: true, email: true } },
  reactivatedAt: true,
  reactivationReason: true,
  reactivatedBy: { select: { id: true, name: true, email: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { followUps: true } },
} satisfies Prisma.CounterpartySelect

type ListRow = Prisma.CounterpartyGetPayload<{ select: typeof listSelect }>
type DetailRow = Prisma.CounterpartyGetPayload<{ select: typeof detailSelect }>

function serializeList(row: ListRow) {
  return {
    id: row.id,
    nit: row.nit,
    businessName: row.businessName,
    status: row.status,
    registrationDate: toDateOnly(row.registrationDate),
    lastFollowUpDate: toDateOnly(row.lastFollowUpDate),
    nextFollowUpDate: toDateOnly(row.nextFollowUpDate),
    calendarStatus: calculateCalendarStatus(row.nextFollowUpDate),
    subprocess: row.subprocess,
  }
}

function serializeDetail(row: DetailRow) {
  return {
    ...serializeList(row),
    observations: row.observations,
    archivedAt: row.archivedAt,
    archiveReason: row.archiveReason,
    archivedBy: row.archivedBy,
    reactivatedAt: row.reactivatedAt,
    reactivationReason: row.reactivationReason,
    reactivatedBy: row.reactivatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    followUpCount: row._count.followUps,
  }
}

@Injectable()
export class CounterpartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(query: ListCounterpartiesQueryDto) {
    const where = this.buildWhere(query)
    const page = query.page
    const pageSize = query.pageSize

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.counterparty.findMany({
        where,
        select: listSelect,
        orderBy: [
          { status: 'asc' },
          { businessName: 'asc' },
          { nit: 'asc' },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.counterparty.count({ where }),
    ])

    return {
      data: rows.map(serializeList),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    }
  }

  async findOne(id: string) {
    const row = await this.prisma.counterparty.findUnique({
      where: { id },
      select: detailSelect,
    })

    if (!row) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    return serializeDetail(row)
  }

  async create(dto: CreateCounterpartyDto, actorId: string) {
    const nit = dto.nit.trim()
    const nitNormalized = normalizeNit(nit)

    await this.ensureNitAvailable(nitNormalized)
    const subprocess = await this.ensureSubprocessAvailable(
      dto.subprocessId,
    )

    const today = getBusinessToday()
    const registrationDate = dto.registrationDate
      ? parseDateOnly(dto.registrationDate)
      : today

    if (registrationDate.getTime() > today.getTime()) {
      throw new BadRequestException(
        'La fecha de registro no puede ser futura',
      )
    }

    const nextFollowUpDate = dto.nextFollowUpDate
      ? parseDateOnly(dto.nextFollowUpDate)
      : addMonths(registrationDate, 6)

    let counterparty: { id: string }

    try {
      counterparty = await this.prisma.counterparty.create({
        data: {
          nit,
          nitNormalized,
          businessName: dto.businessName,
          observations: dto.observations ?? null,
          subprocessId: subprocess.id,
          registrationDate,
          nextFollowUpDate,
        },
        select: { id: true },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Ya existe una contraparte con ese NIT',
        )
      }

      throw error
    }

    await this.audit.record({
      userId: actorId,
      action: 'COUNTERPARTY_CREATED',
      entity: 'Counterparty',
      entityId: counterparty.id,
      details: {
        nit,
        businessName: dto.businessName,
        subprocessId: subprocess.id,
        registrationDate: toDateOnly(registrationDate),
        nextFollowUpDate: toDateOnly(nextFollowUpDate),
      },
    })

    return this.findOne(counterparty.id)
  }

  async update(
    id: string,
    dto: UpdateCounterpartyDto,
    actorId: string,
  ) {
    if (
      dto.nit === undefined &&
      dto.businessName === undefined &&
      dto.subprocessId === undefined &&
      dto.observations === undefined
    ) {
      throw new BadRequestException(
        'No se enviaron cambios para actualizar',
      )
    }

    const current = await this.prisma.counterparty.findUnique({
      where: { id },
      select: {
        id: true,
        nit: true,
        nitNormalized: true,
        businessName: true,
        subprocessId: true,
        observations: true,
      },
    })

    if (!current) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    const normalizedNit =
      dto.nit !== undefined ? normalizeNit(dto.nit) : undefined

    if (normalizedNit && normalizedNit !== current.nitNormalized) {
      await this.ensureNitAvailable(normalizedNit)
    }

    if (
      dto.subprocessId !== undefined &&
      dto.subprocessId !== current.subprocessId
    ) {
      await this.ensureSubprocessAvailable(dto.subprocessId)
    }

    await this.prisma.counterparty.update({
      where: { id },
      data: {
        ...(dto.nit !== undefined && normalizedNit
          ? { nit: dto.nit, nitNormalized: normalizedNit }
          : {}),
        ...(dto.businessName !== undefined
          ? { businessName: dto.businessName }
          : {}),
        ...(dto.subprocessId !== undefined
          ? { subprocessId: dto.subprocessId }
          : {}),
        ...(dto.observations !== undefined
          ? { observations: dto.observations }
          : {}),
      },
    })

    await this.audit.record({
      userId: actorId,
      action: 'COUNTERPARTY_UPDATED',
      entity: 'Counterparty',
      entityId: id,
      details: {
        previous: {
          nit: current.nit,
          businessName: current.businessName,
          subprocessId: current.subprocessId,
          observations: current.observations,
        },
        changes: {
          nit: dto.nit ?? null,
          businessName: dto.businessName ?? null,
          subprocessId: dto.subprocessId ?? null,
          observations: dto.observations ?? null,
        },
      },
    })

    return this.findOne(id)
  }

  async archive(
    id: string,
    dto: CounterpartyActionDto,
    actorId: string,
  ) {
    const current = await this.prisma.counterparty.findUnique({
      where: { id },
      select: {
        id: true,
        nit: true,
        businessName: true,
        status: true,
      },
    })

    if (!current) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    if (current.status === CounterpartyStatus.ARCHIVED) {
      throw new BadRequestException('La contraparte ya está archivada')
    }

    await this.prisma.counterparty.update({
      where: { id },
      data: {
        status: CounterpartyStatus.ARCHIVED,
        archivedAt: new Date(),
        archivedById: actorId,
        archiveReason: dto.reason,
        reactivatedAt: null,
        reactivatedById: null,
        reactivationReason: null,
      },
    })

    await this.audit.record({
      userId: actorId,
      action: 'COUNTERPARTY_ARCHIVED',
      entity: 'Counterparty',
      entityId: id,
      details: {
        nit: current.nit,
        businessName: current.businessName,
        reason: dto.reason,
      },
    })

    return this.findOne(id)
  }

  async reactivate(
    id: string,
    dto: ReactivateCounterpartyDto,
    actorId: string,
  ) {
    const current = await this.prisma.counterparty.findUnique({
      where: { id },
      select: {
        id: true,
        nit: true,
        businessName: true,
        status: true,
      },
    })

    if (!current) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    if (current.status === CounterpartyStatus.ACTIVE) {
      throw new BadRequestException('La contraparte ya está activa')
    }

    const nextFollowUpDate = dto.nextFollowUpDate
      ? parseDateOnly(dto.nextFollowUpDate)
      : undefined

    await this.prisma.counterparty.update({
      where: { id },
      data: {
        status: CounterpartyStatus.ACTIVE,
        reactivatedAt: new Date(),
        reactivatedById: actorId,
        reactivationReason: dto.reason,
        ...(nextFollowUpDate ? { nextFollowUpDate } : {}),
      },
    })

    await this.audit.record({
      userId: actorId,
      action: 'COUNTERPARTY_REACTIVATED',
      entity: 'Counterparty',
      entityId: id,
      details: {
        nit: current.nit,
        businessName: current.businessName,
        reason: dto.reason,
        nextFollowUpDate: toDateOnly(nextFollowUpDate),
      },
    })

    return this.findOne(id)
  }

  private buildWhere(
    query: ListCounterpartiesQueryDto,
  ): Prisma.CounterpartyWhereInput {
    const where: Prisma.CounterpartyWhereInput = {}
    const today = getBusinessToday()

    if (query.status) {
      where.status = query.status
    }

    if (query.subprocessId) {
      where.subprocessId = query.subprocessId
    }

    if (query.calendarStatus) {
      switch (query.calendarStatus) {
        case 'UNSCHEDULED':
          where.nextFollowUpDate = null
          break
        case 'OVERDUE':
          where.nextFollowUpDate = { lt: today }
          break
        case 'PENDING':
          where.nextFollowUpDate = {
            gte: today,
            lte: addDays(today, 15),
          }
          break
        case 'UPCOMING':
          where.nextFollowUpDate = {
            gte: addDays(today, 16),
            lte: addDays(today, 30),
          }
          break
        case 'ON_TIME':
          where.nextFollowUpDate = { gt: addDays(today, 30) }
          break
      }
    }

    const search = query.search?.trim()

    if (search) {
      const normalizedSearch = normalizeNit(search)
      const filters: Prisma.CounterpartyWhereInput[] = [
        { businessName: { contains: search, mode: 'insensitive' } },
        { nit: { contains: search, mode: 'insensitive' } },
      ]

      if (normalizedSearch) {
        filters.push({
          nitNormalized: { contains: normalizedSearch },
        })
      }

      where.OR = filters
    }

    return where
  }

  private async ensureNitAvailable(nitNormalized: string): Promise<void> {
    const existing = await this.prisma.counterparty.findUnique({
      where: { nitNormalized },
      select: { id: true },
    })

    if (existing) {
      throw new ConflictException(
        'Ya existe una contraparte con ese NIT',
      )
    }
  }

  private async ensureSubprocessAvailable(subprocessId: string) {
    const subprocess = await this.prisma.subprocess.findUnique({
      where: { id: subprocessId },
      select: { id: true, active: true },
    })

    if (!subprocess) {
      throw new BadRequestException(
        'El subproceso seleccionado no existe',
      )
    }

    if (!subprocess.active) {
      throw new BadRequestException(
        'El subproceso seleccionado está inactivo',
      )
    }

    return subprocess
  }
}
