import axios from 'axios'

type ApiErrorBody = {
  message?: string | string[]
}

export function getApiErrorMessage(
  error: unknown,
  fallback = 'Ocurrió un error inesperado',
): string {
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message

    if (Array.isArray(message)) {
      return message.join('. ')
    }

    if (typeof message === 'string' && message.trim()) {
      return message
    }

    if (!error.response) {
      return 'No fue posible conectar con el servidor'
    }
  }

  return fallback
}
