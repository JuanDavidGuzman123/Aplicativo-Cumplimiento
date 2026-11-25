import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DelegatedTokenStore } from './delegated-token.store.js'

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}))

const TOKEN_PATH = join(process.cwd(), '.microsoft-tokens.json')

describe('DelegatedTokenStore', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('devuelve el token en memoria sin leer el archivo', async () => {
    const store = new DelegatedTokenStore()
    await store.write('token-en-memoria')
    vi.mocked(readFile).mockClear()
    vi.mocked(writeFile).mockClear()

    await expect(store.read()).resolves.toBe('token-en-memoria')

    expect(readFile).not.toHaveBeenCalled()
  })

  it('lee el token del archivo, lo recorta y cachea lecturas posteriores', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({
        refreshToken: '  token-del-archivo\n',
        updatedAt: '2026-11-25T12:00:00.000Z',
      }) as never,
    )
    const store = new DelegatedTokenStore()

    await expect(store.read()).resolves.toBe('token-del-archivo')
    await expect(store.read()).resolves.toBe('token-del-archivo')

    expect(readFile).toHaveBeenCalledTimes(1)
    expect(readFile).toHaveBeenCalledWith(TOKEN_PATH, 'utf8')
  })

  it('devuelve una cadena vacía si el archivo no existe', async () => {
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT'))

    await expect(new DelegatedTokenStore().read()).resolves.toBe('')
  })

  it('devuelve una cadena vacía si el JSON no es válido', async () => {
    vi.mocked(readFile).mockResolvedValueOnce('no es json' as never)

    await expect(new DelegatedTokenStore().read()).resolves.toBe('')
  })

  it('devuelve una cadena vacía si falta refreshToken', async () => {
    vi.mocked(readFile).mockResolvedValueOnce(
      JSON.stringify({ updatedAt: '2026-11-25T12:00:00.000Z' }) as never,
    )

    await expect(new DelegatedTokenStore().read()).resolves.toBe('')
  })

  it('guarda el token en memoria y escribe JSON con modo 0o600', async () => {
    const store = new DelegatedTokenStore()

    await store.write('token-nuevo')

    expect(writeFile).toHaveBeenCalledTimes(1)
    const [filePath, contents, options] = vi.mocked(writeFile).mock.calls[0] ?? []
    expect(filePath).toBe(TOKEN_PATH)
    const parsed = JSON.parse(contents as string) as {
      refreshToken: string
      updatedAt: string
    }
    expect(parsed.refreshToken).toBe('token-nuevo')
    expect(Date.parse(parsed.updatedAt)).not.toBeNaN()
    expect(options).toEqual({ encoding: 'utf8', mode: 0o600 })

    vi.mocked(readFile).mockClear()
    await expect(store.read()).resolves.toBe('token-nuevo')
    expect(readFile).not.toHaveBeenCalled()
  })
})
