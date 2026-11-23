import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from './audit.service.js';

describe('AuditService.record', () => {
  it('persists audit entries', async () => {
    const create = vi.fn().mockResolvedValue({});
    const prisma = { auditLog: { create } };
    const service = new AuditService(
      prisma as unknown as PrismaService,
    );
    const entry = {
      userId: '11111111-1111-1111-1111-111111111111',
      action: 'USER_CREATED',
      entity: 'User',
      entityId: '22222222-2222-2222-2222-222222222222',
      details: { email: 'usuario@example.com' },
    };

    await service.record(entry);

    expect(create).toHaveBeenCalledWith({ data: entry });
  });
});
