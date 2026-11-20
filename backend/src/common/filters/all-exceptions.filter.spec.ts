import {
  BadRequestException,
  type ArgumentsHost,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AllExceptionsFilter } from './all-exceptions.filter.js'

function createHost(path = '/api/recurso') {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  const request = {
    method: 'GET',
    originalUrl: path,
    url: path,
  } as Request
  const response = { status } as unknown as Response
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost

  return { host, status, json }
}

describe('AllExceptionsFilter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('normalizes validation errors and adds request metadata', () => {
    const filter = new AllExceptionsFilter()
    const { host, status, json } = createHost(
      '/api/dashboard/attention?page=0',
    )

    filter.catch(
      new BadRequestException(['La página debe ser mayor o igual a 1']),
      host,
    )

    expect(status).toHaveBeenCalledWith(400)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        message: ['La página debe ser mayor o igual a 1'],
        error: 'Bad Request',
        path: '/api/dashboard/attention?page=0',
      }),
    )
    expect(
      Date.parse(json.mock.calls[0][0].timestamp),
    ).not.toBeNaN()
  })

  it('preserves messages from HTTP exceptions', () => {
    const filter = new AllExceptionsFilter()
    const { host, status, json } = createHost('/api/no-existe')

    filter.catch(new NotFoundException('Recurso no encontrado'), host)

    expect(status).toHaveBeenCalledWith(404)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: 'Recurso no encontrado',
        error: 'Not Found',
      }),
    )
  })

  it('hides unexpected error details and logs the failure', () => {
    const logSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined)
    const filter = new AllExceptionsFilter()
    const { host, status, json } = createHost('/api/falla')

    filter.catch(new Error('detalle interno sensible'), host)

    expect(status).toHaveBeenCalledWith(500)
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 500,
        message: 'Error interno del servidor',
        error: 'Internal Server Error',
      }),
    )
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain(
      'detalle interno sensible',
    )
    expect(logSpy).toHaveBeenCalled()
  })
})
