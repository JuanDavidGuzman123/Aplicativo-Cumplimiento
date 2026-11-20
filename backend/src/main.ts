import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  AppModule,
  ObserveInstrument,
} from './app.module.js';
import { configureApp } from './app.setup.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
  });
  const config = app.get(ConfigService);

  configureApp(app);
  app.enableShutdownHooks();

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
}

await bootstrap();
