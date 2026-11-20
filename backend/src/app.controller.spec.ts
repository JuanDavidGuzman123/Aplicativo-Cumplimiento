import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: vi.fn() };

  beforeEach(async () => {
    prisma.$queryRaw.mockReset();

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('reporta ok cuando la base de datos responde', async () => {
    prisma.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    await expect(appController.health()).resolves.toMatchObject({
      status: 'ok',
      database: 'connected',
    });
  });

  it('reporta 503 cuando la base de datos falla', async () => {
    prisma.$queryRaw.mockRejectedValue(new Error('sin conexión'));

    await expect(appController.health()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
