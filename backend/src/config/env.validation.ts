import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum ExternalDataSource {
  Graph = 'graph',
  File = 'file',
}

class EnvironmentVariables {
  @IsEnum(Environment)
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32)
  JWT_SECRET!: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN = '8h';

  @Type(() => Number)
  @IsInt()
  @Min(4)
  @Max(15)
  @IsOptional()
  BCRYPT_SALT_ROUNDS = 12;

  @IsString()
  @IsOptional()
  CORS_ORIGIN = 'http://localhost:5173';

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  @IsOptional()
  TRUST_PROXY = 0;

  @IsString()
  @IsOptional()
  TZ = 'America/Bogota';

  @IsString()
  @IsOptional()
  SCHEDULE_NOTIFICATIONS_CRON = '0 7 * * *';

  @IsString()
  @IsOptional()
  SCHEDULE_ANNUAL_NOTIFICATIONS_CRON = '0 7 * * *';

  @IsString()
  @IsOptional()
  UPLOAD_DIR = '../uploads';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  MAX_FILE_SIZE_MB = 10;

  @IsString()
  @IsOptional()
  ALLOWED_DOCUMENT_MIME_TYPES = '';

  @IsString()
  @IsOptional()
  SEED_ADMIN_NAME = 'Administrador';

  @IsString()
  @IsOptional()
  SEED_ADMIN_EMAIL = '';

  @IsString()
  @IsOptional()
  SEED_ADMIN_PASSWORD = '';

  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1',
  )
  @IsBoolean()
  @IsOptional()
  EXTERNAL_DATA_ENABLED = false;

  @IsEnum(ExternalDataSource)
  @IsOptional()
  EXTERNAL_DATA_SOURCE = ExternalDataSource.Graph;

  @IsString()
  @IsOptional()
  EXTERNAL_WORKBOOK_PATH = '';

  @IsString()
  @IsOptional()
  MICROSOFT_TENANT_ID = '';

  @IsString()
  @IsOptional()
  MICROSOFT_CLIENT_ID = '';

  @IsString()
  @IsOptional()
  MICROSOFT_CLIENT_SECRET = '';

  @IsString()
  @IsOptional()
  MICROSOFT_REFRESH_TOKEN = '';

  @IsString()
  @IsOptional()
  SHAREPOINT_DRIVE_ID = '';

  @IsString()
  @IsOptional()
  SHAREPOINT_ITEM_ID = '';

  @IsString()
  @IsOptional()
  EXTERNAL_DATA_TABLE_NAME = '';

  @IsString()
  @IsOptional()
  EXTERNAL_DATA_WORKSHEET_NAME = '';

  @IsString()
  @IsOptional()
  EXTERNAL_COLOCADORES_WORKBOOK_PATH = '';

  @IsString()
  @IsOptional()
  EXTERNAL_COLOCADORES_WORKSHEET_NAME = 'FR-SG-81';

  @IsString()
  @IsOptional()
  EXTERNAL_CLIENTES_WORKBOOK_PATH = '';

  @IsString()
  @IsOptional()
  EXTERNAL_CLIENTES_WORKSHEET_NAME = 'FR-SG-80';

  @IsString()
  @IsOptional()
  EXTERNAL_CLIENTES_COLUMN_MAP = '';

  @IsString()
  @IsOptional()
  EXTERNAL_PROVEEDORES_WORKBOOK_PATH = '';

  @IsString()
  @IsOptional()
  EXTERNAL_PROVEEDORES_WORKSHEET_NAME = 'FR-SG-83';

  @IsString()
  @IsOptional()
  EXTERNAL_PROVEEDORES_COLUMN_MAP = '';

  @IsString()
  @IsOptional()
  EXTERNAL_DATA_COLUMN_MAP = '';

  @IsString()
  @IsOptional()
  EXTERNAL_WEBHOOK_PUBLIC_URL = '';

  @IsString()
  @IsOptional()
  EXTERNAL_WEBHOOK_CLIENT_STATE = '';

  @IsString()
  @IsOptional()
  EXTERNAL_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

  @Type(() => Number)
  @IsInt()
  @Min(1000)
  @Max(120000)
  @IsOptional()
  EXTERNAL_GRAPH_TIMEOUT_MS = 15000;

  @Type(() => Number)
  @IsInt()
  @Min(30000)
  @Max(86400000)
  @IsOptional()
  EXTERNAL_FALLBACK_POLL_MS = 900000;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(60000)
  @IsOptional()
  EXTERNAL_REFRESH_DEBOUNCE_MS = 2000;

  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50000)
  @IsOptional()
  EXTERNAL_MAX_ROWS = 5000;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(parsed, { skipMissingProperties: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Configuración de entorno inválida: ${details}`);
  }

  return parsed;
}
