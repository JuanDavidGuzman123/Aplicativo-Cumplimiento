import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common'
import type { Request, Response } from 'express'

type HttpErrorBody = {
  message?: string | string[]
  error?: string
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp()
    const request = context.getRequest<Request>()
    const response = context.getResponse<Response>()
    const isHttpException = exception instanceof HttpException
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR

    let message: string | string[] = 'Error interno del servidor'
    let error = 'Internal Server Error'

    if (isHttpException) {
      const exceptionResponse = exception.getResponse()

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse
        error = exception.name
      } else if (
        exceptionResponse &&
        typeof exceptionResponse === 'object'
      ) {
        const body = exceptionResponse as HttpErrorBody
        message = body.message ?? exception.message
        error = body.error ?? exception.name
      } else {
        message = exception.message
        error = exception.name
      }
    } else {
      this.logger.error(
        `Error no controlado en ${request.method} ${request.originalUrl ?? request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      )
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
    })
  }
}
