import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  CounterpartyStatus,
  FollowUpStatus,
  UserRole,
  type Prisma,
} from '@prisma/client'
import { AuditService } from '../audit/audit.service.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import {
  addMonths,
  getBusinessToday,
  parseDateOnly,
  toDateOnly,
} from '../common/utils/dates.js'
import { PrismaService } from '../prisma/prisma.service.js'
import { CreateFollowUpDto } from './dto/create-follow-up.dto.js'
import { FinalizeFollowUpDto } from './dto/finalize-follow-up.dto.js'
import { UpdateFollowUpDto } from './dto/update-follow-up.dto.js'

const followUpSelect = {
  id: true,
  counterpartyId: true,
  performedAt: true,
  result: true,
  observations: true,
  status: true,
  finalizedAt: true,
  createdAt: true,
  updatedAt: true,
  responsibleUser: {
    select: { id: true, name: true, email: true },
  },
  documents: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
      uploadedBy: {
        select: { id: true, name: true, email: true },
      },
    },
  },
} satisfies Prisma.FollowUpSelect

type FollowUpRow = Prisma.FollowUpGetPayload<{
  select: typeof followUpSelect
}>

function normalizeText(value: string | null | undefined) {
  if (value === undefined) {
    return undefined
  }

  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function serializeFollowUp(row: FollowUpRow) {
  return {
    id: row.id,
    counterpartyId: row.counterpartyId,
    performedAt: toDateOnly(row.performedAt),
    result: row.result,
    observations: row.observations,
    status: row.status,
    finalizedAt: row.finalizedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    responsibleUser: row.responsibleUser,
    documents: row.documents,
  }
}

@Injectable()
export class FollowUpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll(counterpartyId: string) {
    await this.ensureCounterpartyExists(counterpartyId)

    const rows = await this.prisma.followUp.findMany({
      where: { counterpartyId },
      select: followUpSelect,
      orderBy: [{ performedAt: 'desc' }, { createdAt: 'desc' }],
    })

    return rows.map(serializeFollowUp)
  }

  async create(
    counterpartyId: string,
    dto: CreateFollowUpDto,
    actor: AuthenticatedUser,
  ) {
    const counterparty = await this.prisma.counterparty.findUnique({
      where: { id: counterpartyId },
      select: { id: true, status: true },
    })

    if (!counterparty) {
      throw new NotFoundException('Contraparte no encontrada')
    }

    if (counterparty.status === CounterpartyStatus.ARCHIVED) {
      throw new BadRequestException(
        'No se pueden registrar seguimientos para una contraparte archivada',
      )
    }

    const performedAt = this.resolvePerformedAt(dto.performedAt)
    const result = normalizeText(dto.result) ?? null
    const observations = normalizeText(dto.observations) ?? null

    const followUp = await this.prisma.followUp.create({
      data: {
        counterpartyId,
        performedAt,
        responsibleUserId: actor.id,
        result,
        observations,
      },
      select: followUpSelect,
    })

    await this.audit.record({
      userId: actor.id,
      action: 'FOLLOW_UP_CREATED',
      entity: 'FollowUp',
      entityId: followUp.id,
      details: {
        counterpartyId,
        performedAt: toDateOnly(performedAt),
      },
    })

    return serializeFollowUp(followUp)
  }

  async update(
    id: string,
    dto: UpdateFollowUpDto,
    actor: AuthenticatedUser,
  ) {
    if (
      dto.performedAt === undefined &&
      dto.result === undefined &&
      dto.observations === undefined
    ) {
      throw new BadRequestException(
        'No se enviaron cambios para actualizar',
      )
    }

    const current = await this.findEditable(id)
    this.ensureCanEdit(current.responsibleUserId, actor)

    const performedAt =
      dto.performedAt !== undefined
        ? this.resolvePerformedAt(dto.performedAt)
        : undefined
    const result = normalizeText(dto.result)
    const observations = normalizeText(dto.observations)

    const followUp = await this.prisma.followUp.update({
      where: { id },
      data: {
        ...(performedAt ? { performedAt } : {}),
        ...(result !== undefined ? { result } : {}),
        ...(observations !== undefined ? { observations } : {}),
      },
      select: followUpSelect,
    })

    await this.audit.record({
      userId: actor.id,
      action: 'FOLLOW_UP_UPDATED',
      entity: 'FollowUp',
      entityId: id,
      details: {
        counterpartyId: current.counterpartyId,
        changes: {
          performedAt: performedAt ? toDateOnly(performedAt) : null,
          result: dto.result !== undefined,
          observations: dto.observations !== undefined,
        },
      },
    })

    return serializeFollowUp(followUp)
  }

  async finalize(
    id: string,
    dto: FinalizeFollowUpDto,
    actor: AuthenticatedUser,
  ) {
    const current = await this.findEditable(id)
    this.ensureCanEdit(current.responsibleUserId, actor)

    const performedAt =
      dto.performedAt !== undefined
        ? this.resolvePerformedAt(dto.performedAt)
        : current.performedAt
    const result =
      dto.result !== undefined
        ? normalizeText(dto.result)
        : current.result
    const observations =
      dto.observations !== undefined
        ? normalizeText(dto.observations)
        : current.observations

    if (!result?.trim()) {
      throw new BadRequestException(
        'Debe registrar el resultado del seguimiento antes de finalizarlo',
      )
    }

    const nextFollowUpDate = addMonths(performedAt, 6)
    const finalizedAt = new Date()

    const [followUp] = await this.prisma.$transaction([
      this.prisma.followUp.update({
        where: { id },
        data: {
          performedAt,
          result,
          observations,
          status: FollowUpStatus.FINALIZED,
          finalizedAt,
        },
        select: followUpSelect,
      }),
      this.prisma.counterparty.update({
        where: { id: current.counterpartyId },
        data: {
          lastFollowUpDate: performedAt,
          nextFollowUpDate,
        },
        select: { id: true },
      }),
    ])

    await this.audit.record({
      userId: actor.id,
      action: 'FOLLOW_UP_FINALIZED',
      entity: 'FollowUp',
      entityId: id,
      details: {
        counterpartyId: current.counterpartyId,
        performedAt: toDateOnly(performedAt),
        nextFollowUpDate: toDateOnly(nextFollowUpDate),
      },
    })

    return serializeFollowUp(followUp)
  }

  private async findEditable(id: string) {
    const row = await this.prisma.followUp.findUnique({
      where: { id },
      select: {
        id: true,
        counterpartyId: true,
        performedAt: true,
        result: true,
        observations: true,
        status: true,
        responsibleUserId: true,
        counterparty: {
          select: { status: true },
        },
      },
    })

    if (!row) {
      throw new NotFoundException('Seguimiento no encontrado')
    }

    if (row.status === FollowUpStatus.FINALIZED) {
      throw new BadRequestException(
        'El seguimiento ya está finalizado y no se puede modificar',
      )
    }

    if (row.counterparty.status === CounterpartyStatus.ARCHIVED) {
      throw new BadRequestException(
        'No se pueden modificar seguimientos de una contraparte archivada',
      )
    }

    return row
  }

  private ensureCanEdit(
    responsibleUserId: string,
    actor: AuthenticatedUser,
  ) {
    if (
      actor.role !== UserRole.ADMIN &&
      actor.id !== responsibleUserId
    ) {
      throw new ForbiddenException(
        'Solo el responsable del seguimiento o un administrador puede realizar esta acción',
      )
    }
  }

  private resolvePerformedAt(value?: string) {
    const performedAt = value ? parseDateOnly(value) : getBusinessToday()
    const today = getBusinessToday()

    if (performedAt.getTime() > today.getTime()) {
      throw new BadRequestException(
        'La fecha de realización no puede ser futura',
      )
    }

    return performedAt
  }

  private async ensureCounterpartyExists(id: string) {
    const counterparty = await this.prisma.counterparty.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!counterparty) {
      throw new NotFoundException('Contraparte no encontrada')
    }
  }
}
