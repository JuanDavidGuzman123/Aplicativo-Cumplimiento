import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

type DeviceCodeResponse = {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval?: number
  message?: string
}

type TokenResponse = {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

function parseEnv(raw: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const separator = trimmed.indexOf('=')
    if (separator < 0) {
      continue
    }
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    result[key] = value
  }
  return result
}

const envPath = join(process.cwd(), '.env')
const env = {
  ...process.env,
  ...parseEnv(await readFile(envPath, 'utf8')),
}

const tenantId = env.MICROSOFT_TENANT_ID?.trim() ?? ''
const clientId = env.MICROSOFT_CLIENT_ID?.trim() ?? ''
const clientSecret = env.MICROSOFT_CLIENT_SECRET ?? ''

if (!tenantId || !clientId || !clientSecret) {
  throw new Error(
    'Faltan MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_ID o MICROSOFT_CLIENT_SECRET en backend/.env',
  )
}

const deviceUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/devicecode`
const deviceResponse = await fetch(deviceUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: clientId,
    scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
  }),
})

if (!deviceResponse.ok) {
  throw new Error(await deviceResponse.text())
}

const device = (await deviceResponse.json()) as DeviceCodeResponse
console.log(`Abre: ${device.verification_uri}`)
console.log(`Código: ${device.user_code}`)
if (device.message) {
  console.log(device.message)
}

const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`
const deadline = Date.now() + device.expires_in * 1000
let waitMs = Math.max(device.interval ?? 5, 5) * 1000

while (Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, waitMs))

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      device_code: device.device_code,
      client_id: clientId,
    }),
  })

  const data = (await tokenResponse.json()) as TokenResponse

  if (tokenResponse.ok && data.access_token) {
    if (!data.refresh_token) {
      throw new Error('Microsoft no devolvió un refresh_token')
    }
    await writeFile(
      join(process.cwd(), '.microsoft-tokens.json'),
      JSON.stringify(
        {
          refreshToken: data.refresh_token,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      { encoding: 'utf8', mode: 0o600 },
    )
    console.log('DEVICE_LOGIN=OK')
    process.exit(0)
  }

  if (data.error === 'slow_down') {
    waitMs += 5000
    continue
  }
  if (data.error === 'authorization_pending') {
    continue
  }
  if (data.error === 'expired_token') {
    throw new Error('El código de dispositivo expiró')
  }
  if (data.error === 'access_denied') {
    throw new Error('Acceso denegado por el usuario')
  }
  throw new Error(
    data.error_description ?? data.error ?? `HTTP ${tokenResponse.status}`,
  )
}

throw new Error('Tiempo agotado esperando la autorización')
