import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { AuditService } from '../audit/audit.service.js'
import type { AuthenticatedUser } from '../common/types/authenticated-user.js'
import { PrismaService } from '../prisma/prisma.service.js'

export type UploadedDocumentFile = {
  originalname: string
  mimetype: string
  size: number
  buffer: Buffer
}

const DEFAULT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/jpeg',
]

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async upload(
    followUpId: string,
    file: UploadedDocumentFile | undefined,
    actor: AuthenticatedUser,
  ) {
    if (!file) {
      throw new BadRequestException('Seleccione un archivo para adjuntar')
    }

    if (file.size === 0) {
      throw new BadRequestException('El archivo está vacío')
    }

    const followUp = await this.prisma.followUp.findUnique({
      where: { id: followUpId },
      select: { id: true, counterpartyId: true },
    })

    if (!followUp) {
      throw new NotFoundException('Seguimiento no encontrado')
    }

    const maxSizeMb = this.config.get<number>('MAX_FILE_SIZE_MB') ?? 10
    const maxSizeBytes = maxSizeMb * 1024 * 1024

    if (file.size > maxSizeBytes) {
      throw new BadRequestException(
        `El archivo supera el límite de ${maxSizeMb} MB`,
      )
    }

    const allowedMimeTypes = this.getAllowedMimeTypes()

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'El tipo de archivo no está permitido. Use PDF, DOCX, XLSX o JPG',
      )
    }

    const uploadDir = this.getUploadDir()
    await mkdir(uploadDir, { recursive: true })

    const extension = path
      .extname(file.originalname)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 10)
    const storedName = `${randomUUID()}${extension}`
    const storagePath = path.join(uploadDir, storedName)
    const originalName =
      file.originalname.trim().slice(0, 255) || 'documento'

    await writeFile(storagePath, file.buffer)

    let document

    try {
      document = await this.prisma.document.create({
        data: {
          followUpId,
          originalName,
          storedName,
          mimeType: file.mimetype,
          size: file.size,
          storagePath: storedName,
          uploadedById: actor.id,
        },
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
      })
    } catch (error) {
      await unlink(storagePath).catch(() => undefined)
      throw error
    }

    await this.audit.record({
      userId: actor.id,
      action: 'DOCUMENT_UPLOADED',
      entity: 'Document',
      entityId: document.id,
      details: {
        followUpId,
        counterpartyId: followUp.counterpartyId,
        originalName,
        mimeType: file.mimetype,
        size: file.size,
      },
    })

    return document
  }

  async getDownload(id: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        storagePath: true,
      },
    })

    if (!document) {
      throw new NotFoundException('Documento no encontrado')
    }

    const uploadDir = this.getUploadDir()
    const filePath = path.resolve(uploadDir, document.storagePath)
    const relativePath = path.relative(uploadDir, filePath)

    if (
      relativePath.startsWith('..') ||
      path.isAbsolute(relativePath)
    ) {
      throw new NotFoundException('Documento no encontrado')
    }

    try {
      await stat(filePath)
    } catch {
      throw new NotFoundException(
        'El archivo del documento no está disponible',
      )
    }

    return { document, filePath }
  }

  private getUploadDir() {
    const configured = this.config.get<string>('UPLOAD_DIR') ?? '../uploads'
    return path.resolve(process.cwd(), configured)
  }

  private getAllowedMimeTypes() {
    const configured = (
      this.config.get<string>('ALLOWED_DOCUMENT_MIME_TYPES') ?? ''
    )
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)

    return configured.length > 0
      ? configured
      : DEFAULT_ALLOWED_MIME_TYPES
  }
}
