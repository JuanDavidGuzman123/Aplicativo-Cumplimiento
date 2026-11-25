import { describe, expect, it, vi } from 'vitest'
import type { ExternalChangeDetectionService } from './external-change-detection.service.js'
import { ExternalWebhookController } from './external-webhook.controller.js'

function createController(handleWebhook = vi.fn()) {
  const changeDetection = {
    handleWebhook,
  } as unknown as ExternalChangeDetectionService

  return {
    controller: new ExternalWebhookController(changeDetection),
    handleWebhook,
  }
}

describe('ExternalWebhookController', () => {
  it('devuelve el validationToken recibido', () => {
    const { controller } = createController()

    expect(controller.validate('token-de-validacion')).toBe(
      'token-de-validacion',
    )
  })

  it('devuelve una cadena vacía cuando no hay validationToken', () => {
    const { controller } = createController()

    expect(controller.validate()).toBe('')
  })

  it('delega el payload al detector de cambios y responde ok', async () => {
    const { controller, handleWebhook } = createController(
      vi.fn().mockResolvedValue(undefined),
    )
    const payload = {
      value: [
        {
          subscriptionId: 'subscription-1',
          clientState: 'secreto-compartido-largo',
          changeType: 'updated',
        },
      ],
    }

    const result = await controller.notifications(payload)

    expect(handleWebhook).toHaveBeenCalledTimes(1)
    expect(handleWebhook).toHaveBeenCalledWith(payload)
    expect(result).toEqual({ ok: true })
  })

  it('propaga el error cuando el detector de cambios rechaza', async () => {
    const { controller, handleWebhook } = createController(
      vi.fn().mockRejectedValue(new Error('webhook inválido')),
    )
    const payload = { value: [] }

    await expect(controller.notifications(payload)).rejects.toThrow(
      'webhook inválido',
    )
    expect(handleWebhook).toHaveBeenCalledWith(payload)
  })
})
