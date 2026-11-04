import {createHash, randomBytes, randomUUID} from 'node:crypto'
import {chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs'
import {join} from 'node:path'
import {z} from 'zod'

export const TRUSTED_BROWSERS_FILE = 'trusted-browsers.json'

const TrustedBrowserSchema = z.object({
  id: z.string().min(1),
  hash: z.string().min(1),
  browser: z.string(),
  origin: z.string(),
  grantedAt: z.number(),
})

const TrustFileSchema = z.object({browsers: z.array(TrustedBrowserSchema)})

export type TrustedBrowser = z.infer<typeof TrustedBrowserSchema>

export type BrowserRequester = {browser: string; origin: string}

function trustFile(stateDir: string): string {
  return join(stateDir, TRUSTED_BROWSERS_FILE)
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}

function readText(path: string): string | null {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

export function parseTrustedBrowsers(raw: string): TrustedBrowser[] {
  return TrustFileSchema.parse(JSON.parse(raw)).browsers
}

export function readTrustedBrowsers(stateDir: string): TrustedBrowser[] {
  const raw = readText(trustFile(stateDir))
  if (raw === null) return []
  return parseTrustedBrowsers(raw)
}

export function writeTrustedBrowsers(stateDir: string, browsers: readonly TrustedBrowser[]): void {
  const path = trustFile(stateDir)
  mkdirSync(stateDir, {recursive: true})
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    writeFileSync(tempPath, `${JSON.stringify({browsers}, null, 2)}\n`, {mode: 0o600})
    chmodSync(tempPath, 0o600)
    renameSync(tempPath, path)
  } catch (error) {
    rmSync(tempPath, {force: true})
    throw error
  }
}

export function grantBrowser(stateDir: string, requester: BrowserRequester, grantedAt: number): string {
  const token = randomBytes(32).toString('base64url')
  const hash = tokenHash(token)
  writeTrustedBrowsers(stateDir, [
    ...readTrustedBrowsers(stateDir),
    {id: hash.slice(0, 8), hash, browser: requester.browser, origin: requester.origin, grantedAt},
  ])
  return token
}

export function isTrustedBrowser(stateDir: string, token: string): boolean {
  const hash = tokenHash(token)
  return readTrustedBrowsers(stateDir).some((entry) => entry.hash === hash)
}

export function revokeBrowsers(stateDir: string, which: {id: string} | 'all'): TrustedBrowser[] {
  const browsers = readTrustedBrowsers(stateDir)
  const revoked = which === 'all' ? browsers : browsers.filter((entry) => entry.id === which.id)
  if (revoked.length === 0) return []
  writeTrustedBrowsers(
    stateDir,
    browsers.filter((entry) => !revoked.includes(entry)),
  )
  return revoked
}
