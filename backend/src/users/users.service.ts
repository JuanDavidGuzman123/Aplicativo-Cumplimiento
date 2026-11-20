import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';
import { AuditService } from '../audit/audit.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({
      select: publicUserSelect,
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  findByEmailForAuth(email: string) {
    return this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
    });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        'Ya existe un usuario con ese correo electrónico',
      );
    }

    const saltRounds = Number(
      this.config.get<number>('BCRYPT_SALT_ROUNDS') ?? 12,
    );
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email,
        passwordHash,
        role: dto.role,
      },
      select: publicUserSelect,
    });

    await this.audit.record({
      userId: actorId,
      action: 'USER_CREATED',
      entity: 'User',
      entityId: user.id,
      details: { name: user.name, email: user.email, role: user.role },
    });

    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    if (dto.name === undefined && dto.role === undefined) {
      throw new BadRequestException('No se enviaron cambios para actualizar');
    }

    const current = await this.prisma.user.findUnique({ where: { id } });

    if (!current) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (
      dto.role !== undefined &&
      dto.role !== current.role &&
      current.role === UserRole.ADMIN &&
      current.active
    ) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, active: true },
      });

      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'Debe existir al menos un administrador activo',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
      },
      select: publicUserSelect,
    });

    await this.audit.record({
      userId: actorId,
      action: 'USER_UPDATED',
      entity: 'User',
      entityId: user.id,
      details: { changes: { name: dto.name, role: dto.role } },
    });

    return user;
  }

  async updateStatus(
    id: string,
    dto: UpdateUserStatusDto,
    actorId: string,
  ) {
    if (!dto.active && id === actorId) {
      throw new BadRequestException('No puede desactivar su propio usuario');
    }

    const current = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });

    if (!current) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (current.active === dto.active) {
      return current;
    }

    if (
      !dto.active &&
      current.role === UserRole.ADMIN &&
      current.active
    ) {
      const activeAdmins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, active: true },
      });

      if (activeAdmins <= 1) {
        throw new BadRequestException(
          'Debe existir al menos un administrador activo',
        );
      }
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: { active: dto.active },
      select: publicUserSelect,
    });

    await this.audit.record({
      userId: actorId,
      action: dto.active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      entity: 'User',
      entityId: user.id,
      details: { email: user.email, active: user.active },
    });

    return user;
  }
}
