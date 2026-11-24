import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { CounterpartyStatus, Prisma, RiskDecision } from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import { DEFAULT_CATEGORY_KEY } from '../categories/category.constants.js'
import { ArriendosWorkbookService } from '../external-data/arriendos-workbook.service.js'
import {
  COLOCADORES_CATEGORY_KEY,
  ColocadoresWorkbookService,
} from '../external-data/colocadores-workbook.service.js'
import type { WorkbookFieldsSnapshot } from '../external-data/colocadores-workbook.writer.service.js'
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
import { EvaluateRiskDto } from './dto/risk-evaluation.dto.js'
import { UpdateCounterpartyDto } from './dto/update-counterparty.dto.js'

type FollowUpWorkbook = {
  writeFollowUp(
    document: string,
    followUp: string,
    observations: string,
  ): Promise<WorkbookFieldsSnapshot>
}

const listSelect = {
  id: true,
  nit: true,
  businessName: true,
  status: true,
  registrationDate: true,
  lastFollowUpDate: true,
  nextFollowUpDate: true,
  observations: true,
  category: {
    select: { id: true, key: true, name: true },
  },
  subprocess: {
    select: { id: true, name: true, active: true },
  },
} satisfies Prisma.CounterpartySelect

const detailSelect = {
  ...listSelect,
  archivedAt: true,
  archiveReason: true,
  archivedBy: { select: { id: true, name: true, email: true } },
  reactivatedAt: true,
  reactivationReason: true,
  reactivatedBy: { select: { id: true, name: true, email: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { followUps: true } },
  riskEvaluations: {
    orderBy: [{ evaluatedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      id: true,
      decision: true,
      evaluatedAt: true,
      nextFollowUpDate: true,
      notes: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  },
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
    observations: row.observations,
    category: row.category,
    subprocess: row.subprocess,
  }
}

function serializeDetail(row: DetailRow) {
  return {
    ...serializeList(row),
    archivedAt: row.archivedAt,
    archiveReason: row.archiveReason,
    archivedBy: row.archivedBy,
    reactivatedAt: row.reactivatedAt,
    reactivationReason: row.reactivationReason,
    reactivatedBy: row.reactivatedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    followUpCount: row._count.followUps,
    riskEvaluations: row.riskEvaluations.map((evaluation) => ({
      id: evaluation.id,
      decision: evaluation.decision,
      evaluatedAt: toDateOnly(evaluation.evaluatedAt),
      nextFollowUpDate: toDateOnly(evaluation.nextFollowUpDate),
      notes: evaluation.notes,
      createdAt: evaluation.createdAt,
      createdBy: evaluation.createdBy,
    })),
  }
}

@Injectable()
export class CounterpartiesService {
  private readonly logger = new Logger(CounterpartiesService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly arriendosWorkbook: ArriendosWorkbookService,
    private readonly colocadoresWorkbook: ColocadoresWorkbookService,
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
    const categoryId = await this.resolveCategoryId(dto.categoryKey)

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
          categoryId,
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
        categoryId,
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

  async evaluateRisk(
    id: string,
    dto: EvaluateRiskDto,
    actorId: string,
  ) {
    const current = await this.prisma.counterparty.findUnique({
      where: { id },
      select: {
        id: true,
        nit: true,
        businessName: true,
        status: true,
        category: { select: { key: true } },
      },
    })

    if (!current) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    if (current.status === CounterpartyStatus.ARCHIVED) {
      throw new BadRequestException(
        'La contraparte está archivada; debe reactivarla antes de evaluarla',
      )
    }

    const today = getBusinessToday()
    const evaluatedAt = dto.evaluatedAt
      ? parseDateOnly(dto.evaluatedAt)
      : today

    if (evaluatedAt.getTime() > today.getTime()) {
      throw new BadRequestException(
        'La fecha de evaluación no puede ser futura',
      )
    }

    const duplicate = await this.prisma.riskEvaluation.findFirst({
      where: {
        counterpartyId: id,
        decision: dto.decision,
        evaluatedAt,
      },
      select: { id: true },
    })

    if (duplicate) {
      throw new ConflictException(
        'Ya se registró una evaluación con esta decisión en la fecha indicada',
      )
    }

    const notes = dto.notes ?? null
    const nextFollowUpDate =
      dto.decision === RiskDecision.CONTINUE
        ? addMonths(evaluatedAt, 6)
        : null

    const categoryKey = current.category?.key
    const workbook = this.workbookFor(categoryKey)
    const workbookSnapshot = workbook
      ? await workbook.writeFollowUp(
          current.nit,
          dto.decision === RiskDecision.CONTINUE ? 'Si' : 'No',
          notes ?? '',
        )
      : null

    try {
      await this.prisma.$transaction([
        this.prisma.counterparty.update({
          where: { id },
          data:
            dto.decision === RiskDecision.CONTINUE
              ? {
                  status: CounterpartyStatus.ACTIVE,
                  lastFollowUpDate: evaluatedAt,
                  nextFollowUpDate,
                }
              : {
                  status: CounterpartyStatus.ARCHIVED,
                  lastFollowUpDate: evaluatedAt,
                  archivedAt: new Date(),
                  archivedById: actorId,
                  archiveReason:
                    notes ?? 'La contraparte ya no presenta riesgo',
                  reactivatedAt: null,
                  reactivatedById: null,
                  reactivationReason: null,
                },
        }),
        this.prisma.riskEvaluation.create({
          data: {
            counterpartyId: id,
            decision: dto.decision,
            evaluatedAt,
            nextFollowUpDate,
            notes,
            createdById: actorId,
          },
        }),
      ])
    } catch (error) {
      await this.restoreWorkbook(
        current.nit,
        categoryKey,
        workbookSnapshot,
      )
      throw error
    }

    await this.audit.record({
      userId: actorId,
      action:
        dto.decision === RiskDecision.CONTINUE
          ? 'COUNTERPARTY_RISK_CONTINUED'
          : 'COUNTERPARTY_RISK_ARCHIVED',
      entity: 'Counterparty',
      entityId: id,
      details: {
        nit: current.nit,
        businessName: current.businessName,
        decision: dto.decision,
        evaluatedAt: toDateOnly(evaluatedAt),
        nextFollowUpDate: toDateOnly(nextFollowUpDate),
        notes,
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
        category: { select: { key: true } },
      },
    })

    if (!current) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    if (current.status === CounterpartyStatus.ACTIVE) {
      throw new BadRequestException('La contraparte ya está activa')
    }

    const evaluatedAt = getBusinessToday()
    const nextFollowUpDate = dto.nextFollowUpDate
      ? parseDateOnly(dto.nextFollowUpDate)
      : addMonths(evaluatedAt, 6)

    const categoryKey = current.category?.key
    const workbook = this.workbookFor(categoryKey)
    const workbookSnapshot = workbook
      ? await workbook.writeFollowUp(current.nit, 'Si', dto.reason)
      : null

    try {
      await this.prisma.$transaction([
        this.prisma.counterparty.update({
          where: { id },
          data: {
            status: CounterpartyStatus.ACTIVE,
            reactivatedAt: new Date(),
            reactivatedById: actorId,
            reactivationReason: dto.reason,
            ...(nextFollowUpDate ? { nextFollowUpDate } : {}),
          },
        }),
        this.prisma.riskEvaluation.create({
          data: {
            counterpartyId: id,
            decision: RiskDecision.REACTIVATE,
            evaluatedAt,
            nextFollowUpDate,
            notes: dto.reason,
            createdById: actorId,
          },
        }),
      ])
    } catch (error) {
      await this.restoreWorkbook(
        current.nit,
        categoryKey,
        workbookSnapshot,
      )
      throw error
    }

    await this.audit.record({
      userId: actorId,
      action: 'COUNTERPARTY_REACTIVATED',
      entity: 'Counterparty',
      entityId: id,
      details: {
        nit: current.nit,
        businessName: current.businessName,
        decision: RiskDecision.REACTIVATE,
        reason: dto.reason,
        nextFollowUpDate: toDateOnly(nextFollowUpDate),
      },
    })

    return this.findOne(id)
  }

  private workbookFor(
    categoryKey: string | undefined,
  ): FollowUpWorkbook | null {
    if (categoryKey === DEFAULT_CATEGORY_KEY) {
      return this.arriendosWorkbook
    }

    if (categoryKey === COLOCADORES_CATEGORY_KEY) {
      return this.colocadoresWorkbook
    }

    return null
  }

  private async restoreWorkbook(
    nit: string,
    categoryKey: string | undefined,
    snapshot: WorkbookFieldsSnapshot | null,
  ): Promise<void> {
    const workbook = this.workbookFor(categoryKey)

    if (!workbook || !snapshot) {
      return
    }

    try {
      await workbook.writeFollowUp(
        nit,
        snapshot.followUp,
        snapshot.observations,
      )
    } catch (error) {
      this.logger.error(
        'No fue posible restaurar las celdas del workbook después de un error de base de datos',
        error instanceof Error ? error.stack : undefined,
      )
    }
  }

  private buildWhere(
    query: ListCounterpartiesQueryDto,
  ): Prisma.CounterpartyWhereInput {
    const where: Prisma.CounterpartyWhereInput = {}
    const today = getBusinessToday()

    if (query.status) {
      where.status = query.status
    }

    if (query.category) {
      where.category = { key: query.category }
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

  private async resolveCategoryId(key?: string): Promise<string> {
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
