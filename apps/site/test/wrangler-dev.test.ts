import {createServer} from 'node:net'
import {readdir} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {describe, expect, it} from 'vitest'
import {startWranglerDev} from './wrangler-dev'

const SITE_PORT = 8799
const INSPECTOR_PORT = 9799

async function persistDirectoryCount(): Promise<number> {
  const entries = await readdir(tmpdir())
  return entries.filter((entry) => entry.startsWith('conciv-site-e2e-')).length
}

async function occupy(port: number): Promise<() => Promise<void>> {
  const blocker = createServer()
  await new Promise<void>((resolve) => blocker.listen(port, '127.0.0.1', () => resolve()))
  return () => new Promise<void>((resolve) => blocker.close(() => resolve()))
}

describe('the wrangler dev helper', () => {
  it('removes its persistence directory when wrangler exits before it is ready', async () => {
    const release = await occupy(INSPECTOR_PORT)
    const before = await persistDirectoryCount()
    const start = startWranglerDev({port: SITE_PORT, inspectorPort: INSPECTOR_PORT})
    await expect(start).rejects.toThrow(/wrangler dev exited/)
    const after = await persistDirectoryCount()
    await release()
    expect(after).toBe(before)
  }, 60_000)
})
