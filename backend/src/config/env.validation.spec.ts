import 'reflect-metadata'
import { describe, expect, it } from 'vitest'
import { validateEnvironment } from './env.validation.js'

const validEnvironment = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:password@localhost:5432/test',
  JWT_SECRET: 'a'.repeat(32),
}

describe('validateEnvironment', () => {
  it('accepts a valid environment and applies defaults', () => {
    const environment = validateEnvironment(validEnvironment)

    expect(environment.PORT).toBe(3000)
    expect(environment.JWT_EXPIRES_IN).toBe('8h')
    expect(environment.BCRYPT_SALT_ROUNDS).toBe(12)
    expect(environment.TRUST_PROXY).toBe(0)
    expect(environment.EXTERNAL_DATA_ENABLED).toBe(false)
    expect(environment.EXTERNAL_GRAPH_BASE_URL).toBe(
      'https://graph.microsoft.com/v1.0',
    )
    expect(environment.EXTERNAL_FALLBACK_POLL_MS).toBe(900000)
  })

  it('rejects a missing database URL', () => {
    expect(() =>
      validateEnvironment({
        NODE_ENV: 'test',
        JWT_SECRET: 'a'.repeat(32),
      }),
    ).toThrow('Configuración de entorno inválida')
  })

  it('rejects a short JWT secret', () => {
    expect(() =>
      validateEnvironment({
        ...validEnvironment,
        JWT_SECRET: 'corto',
      }),
    ).toThrow('Configuración de entorno inválida')
  })
})
