import { Injectable } from '@nestjs/common'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type StoredToken = {
  refreshToken: string
  updatedAt: string
}

@Injectable()
export class DelegatedTokenStore {
  private readonly filePath = join(
    process.cwd(),
    '.microsoft-tokens.json',
  )
  private refreshToken = ''

  async read(): Promise<string> {
    if (this.refreshToken) {
      return this.refreshToken
    }

    try {
      const raw = await readFile(this.filePath, 'utf8')
      const parsed = JSON.parse(raw) as Partial<StoredToken>
      this.refreshToken = parsed.refreshToken?.trim() ?? ''
    } catch {
      this.refreshToken = ''
    }

    return this.refreshToken
  }

  async write(refreshToken: string): Promise<void> {
    this.refreshToken = refreshToken
    const payload: StoredToken = {
      refreshToken,
      updatedAt: new Date().toISOString(),
    }
    await writeFile(this.filePath, JSON.stringify(payload, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    })
  }
}
