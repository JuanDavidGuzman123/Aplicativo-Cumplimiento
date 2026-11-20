import type { INestApplication } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { Test, type TestingModule } from '@nestjs/testing'
import ExcelJS from 'exceljs'
import request from 'supertest'
import type { App } from 'supertest/types.js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { AppModule } from '../src/app.module.js'
import { configureApp } from '../src/app.setup.js'

describe('API (e2e)', () => {
  let app: INestApplication<App>
  let adminToken = ''

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    configureApp(app)
    await app.init()

    const config = app.get(ConfigService)
    const email = config.get<string>('SEED_ADMIN_EMAIL')
    const password = config.get<string>('SEED_ADMIN_PASSWORD')

    if (!email || !password) {
      throw new Error(
        'Las pruebas E2E requieren SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD',
      )
    }

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200)

    adminToken = login.body.accessToken
  }, 30000)

  afterAll(async () => {
    await app.close()
  })

  it('expone salud, cabeceras de seguridad y CORS permitido', async () => {
    const config = app.get(ConfigService)
    const allowedOrigin = (config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')[0]
      ?.trim()

    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', allowedOrigin ?? '')
      .expect(200)

    expect(response.body).toMatchObject({
      status: 'ok',
      database: 'connected',
    })
    expect(response.headers['x-content-type-options']).toBe('nosniff')

    if (allowedOrigin) {
      expect(response.headers['access-control-allow-origin']).toBe(
        allowedOrigin,
      )
    }
  })

  it('rechaza orígenes no permitidos', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/health')
      .set('Origin', 'https://origen-no-permitido.example')
      .expect(200)

    expect(
      response.headers['access-control-allow-origin'],
    ).toBeUndefined()
  })

  it('normaliza errores de autenticación', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .expect(401)

    expect(response.body).toMatchObject({
      statusCode: 401,
      message: 'Token no proporcionado',
      path: '/api/dashboard/summary',
    })
    expect(
      Number.isNaN(Date.parse(response.body.timestamp)),
    ).toBe(false)
  })

  it('rechaza credenciales inválidas con un mensaje genérico', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'no-existe@example.com',
        password: 'Clave123*',
      })
      .expect(401)

    expect(response.body.message).toBe('Credenciales inválidas')
  })

  it('permite consultar el dashboard con JWT', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(response.body.businessDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(response.body.calendar).toEqual(
      expect.objectContaining({
        overdue: expect.any(Number),
        pending: expect.any(Number),
        upcoming: expect.any(Number),
        onTime: expect.any(Number),
        unscheduled: expect.any(Number),
      }),
    )
  })

  it('valida los parámetros del dashboard', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/dashboard/attention?page=0')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'La página debe ser mayor o igual a 1',
      ]),
    )
  })

  it('protege y pagina la auditoría para ADMIN', async () => {
    await request(app.getHttpServer())
      .get('/api/audit')
      .expect(401)

    const response = await request(app.getHttpServer())
      .get('/api/audit')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(response.body.meta).toEqual(
      expect.objectContaining({
        page: 1,
        pageSize: 20,
        total: expect.any(Number),
        totalPages: expect.any(Number),
      }),
    )
    expect(Array.isArray(response.body.data)).toBe(true)
  })

  it('valida el tamaño de página de auditoría', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/audit?pageSize=101')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400)

    expect(response.body.message).toContain(
      'El tamaño de página no puede superar 100',
    )
  })

  it('protege y consulta el resumen anual', async () => {
    await request(app.getHttpServer())
      .get('/api/annual-updates/summary')
      .expect(401)

    const response = await request(app.getHttpServer())
      .get('/api/annual-updates/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)

    expect(response.body.currentYear).toEqual(expect.any(Number))
    expect(response.body.totals).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        active: expect.any(Number),
        inactive: expect.any(Number),
      }),
    )
    expect(response.body.annual).toEqual(
      expect.objectContaining({
        updatedThisYear: expect.any(Number),
        active: expect.objectContaining({
          pendingUpdate: expect.any(Number),
          withoutDate: expect.any(Number),
        }),
        inactive: expect.objectContaining({
          pendingUpdate: expect.any(Number),
          withoutDate: expect.any(Number),
        }),
      }),
    )
    expect(response.body.semiannual).toEqual(
      expect.objectContaining({
        activeWithFollowUp: expect.any(Number),
        inactiveWithFollowUp: expect.any(Number),
        totalWithFollowUp: expect.any(Number),
      }),
    )
  })

  it('previsualiza una base anual sin escribir cambios', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Base anual')
    sheet.addRow([
      'Código punto de venta',
      'Nombre',
      'Estado',
      'Fecha de diligenciamiento',
      'Año',
      'Tipo de debida diligencia',
      'Seguimiento',
      'Observaciones',
    ])
    sheet.addRow([
      'E2E-ANUAL-001',
      'Punto de venta E2E',
      'A',
      '2020-01-15',
      2020,
      'Básica',
      'Sí',
      'Observación E2E',
    ])

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
    const response = await request(app.getHttpServer())
      .post('/api/annual-updates/import/preview')
      .set('Authorization', `Bearer ${adminToken}`)
      .field(
        'mapping',
        JSON.stringify({
          code: 'codigo punto de venta',
          businessName: 'nombre',
          status: 'estado',
          filingDate: 'fecha de diligenciamiento',
          filingYear: 'ano',
          dueDiligenceType: 'tipo de debida diligencia',
          requiresSemiannualFollowUp: 'seguimiento',
          observations: 'observaciones',
        }),
      )
      .attach('file', buffer, {
        filename: 'base-anual-e2e.xlsx',
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      .expect(201)

    expect(response.body.file).toEqual(
      expect.objectContaining({
        name: 'base-anual-e2e.xlsx',
        sheetName: 'Base anual',
        totalRows: 1,
      }),
    )
    expect(response.body.summary).toEqual(
      expect.objectContaining({
        totalRows: 1,
        validRows: 1,
        newRows: 1,
        errorRows: 0,
        canConfirm: true,
      }),
    )
    expect(response.body.rows[0]).toEqual(
      expect.objectContaining({
        action: 'NEW',
        status: 'ACTIVE',
        filingDate: '2020-01-15',
        filingYear: 2020,
        dueDiligenceType: 'Básica',
        observations: 'Observación E2E',
      }),
    )
  })

  it('normaliza rutas no encontradas', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/ruta-inexistente')
      .expect(404)

    expect(response.body).toMatchObject({
      statusCode: 404,
      path: '/api/ruta-inexistente',
    })
  })
})
