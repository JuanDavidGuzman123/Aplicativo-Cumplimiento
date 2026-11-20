import { type INestApplication, ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import helmet from 'helmet'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js'

export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api')
  app.use(helmet())

  const config = app.get(ConfigService)
  const origins = (config.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

  if (origins.length > 0) {
    app.enableCors({
      origin: origins,
      credentials: true,
    })
  }

  const trustProxy = config.get<number>('TRUST_PROXY') ?? 0
  if (trustProxy > 0) {
    const expressApp = app.getHttpAdapter().getInstance() as {
      set: (setting: string, value: unknown) => void
    }
    expressApp.set('trust proxy', trustProxy)
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )
  app.useGlobalFilters(new AllExceptionsFilter())
}
