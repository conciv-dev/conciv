import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {afterAll, beforeAll} from 'vitest'
import type {Page} from 'playwright-core'
import {z} from 'zod'
import {fixtureHost, getExtensionTestApi, type ExtensionTestApi} from '@conciv/extension-testkit'
import type {HarnessAdapter} from '@conciv/protocol/harness-types'
import recorderServer from '../src/server.js'
import {createCaptureControl} from '../src/server/capture-control.js'
import {createRecordingStore} from '../src/server/recordings.js'
import {createClientRings} from '../src/server/rings.js'
import type {RecorderRuntime} from '../src/server/runtime.js'

export async function startLiveCapture(api: ExtensionTestApi): Promise<{captureId: string}> {
  return z.object({captureId: z.string()}).parse(await api.callTool('recording_start', {}))
}

export async function addMarker(page: Page): Promise<string> {
  await page.getByRole('button', {name: 'Add marker'}).click()
  const marker = page.getByRole('button', {name: /^Marker \d+$/}).last()
  await marker.waitFor({state: 'visible', timeout: 10_000})
  const label = await marker.textContent()
  if (!label) throw new Error('marker label missing')
  return label
}

export function runtimeFixture(): RecorderRuntime {
  const rings = createClientRings({windowMs: 60_000})
  return {
    rings,
    control: createCaptureControl(rings),
    config: {masking: 'none', windowMinutes: 10, console: true},
    useRenderer: async () => null,
    recordings: createRecordingStore(mkdtempSync(join(tmpdir(), 'rec-'))),
  }
}

const hostDist = fileURLToPath(new URL('../dist/test-host', import.meta.url))

export function useRecorderTestApi(opts: {harness?: HarnessAdapter} = {}): () => ExtensionTestApi {
  const ctx: {api?: ExtensionTestApi} = {}
  beforeAll(async () => {
    ctx.api = await getExtensionTestApi({server: recorderServer, host: fixtureHost(hostDist), harness: opts.harness})
  }, 120_000)
  afterAll(async () => ctx.api?.dispose())
  return () => {
    if (!ctx.api) throw new Error('testkit not booted')
    return ctx.api
  }
}
