import {createHash, randomBytes, randomUUID} from 'node:crypto'
import {chmod, readFile, rename, rm, writeFile} from 'node:fs/promises'
import {join} from 'node:path'
import {z} from 'zod'
import {createConcivStateDir} from './state-types.js'

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

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (isMissingFile(error)) return null
    throw error
  }
}

export function parseTrustedBrowsers(raw: string): TrustedBrowser[] {
  return TrustFileSchema.parse(JSON.parse(raw)).browsers
}

export async function readTrustedBrowsers(stateDir: string): Promise<TrustedBrowser[]> {
  const raw = await readText(trustFile(stateDir))
  if (raw === null) return []
  return parseTrustedBrowsers(raw)
}

export async function writeTrustedBrowsers(stateDir: string, browsers: readonly TrustedBrowser[]): Promise<void> {
  const path = trustFile(stateDir)
  await createConcivStateDir(stateDir)
  const tempPath = `${path}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(tempPath, `${JSON.stringify({browsers}, null, 2)}\n`, {mode: 0o600})
    await chmod(tempPath, 0o600)
    await rename(tempPath, path)
  } catch (error) {
    await rm(tempPath, {force: true})
    throw error
  }
}

export async function grantBrowser(stateDir: string, requester: BrowserRequester, grantedAt: number): Promise<string> {
  const token = randomBytes(32).toString('base64url')
  const hash = tokenHash(token)
  await writeTrustedBrowsers(stateDir, [
    ...(await readTrustedBrowsers(stateDir)),
    {id: hash.slice(0, 8), hash, browser: requester.browser, origin: requester.origin, grantedAt},
  ])
  return token
}

export async function isTrustedBrowser(stateDir: string, token: string): Promise<boolean> {
  const hash = tokenHash(token)
  return (await readTrustedBrowsers(stateDir)).some((entry) => entry.hash === hash)
}

export async function revokeBrowsers(stateDir: string, which: {id: string} | 'all'): Promise<TrustedBrowser[]> {
  const browsers = await readTrustedBrowsers(stateDir)
  const revoked = which === 'all' ? browsers : browsers.filter((entry) => entry.id === which.id)
  if (revoked.length === 0) return []
  await writeTrustedBrowsers(
    stateDir,
    browsers.filter((entry) => !revoked.includes(entry)),
  )
  return revoked
}
