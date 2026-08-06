import {spawnSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {describe, expect, test} from 'vitest'
import {z} from 'zod'

const LoadedSchema = z.object({cached: z.array(z.string()), shared: z.array(z.string())})

const startEntry = fileURLToPath(new URL('../../dist/start.js', import.meta.url))

const probeScript = `
import {createRequire} from 'node:module'
import {pathToFileURL} from 'node:url'
await import(pathToFileURL(process.argv[1]).href)
const require = createRequire(import.meta.url)
const cached = Object.keys(require.cache ?? {}).filter((path) => path.includes('isolated-vm'))
const shared = (process.report.getReport().sharedObjects ?? []).filter((path) => path.includes('isolated_vm'))
console.log(JSON.stringify({cached, shared}))
`

describe('isolate driver laziness', () => {
  test('importing the engine entry never evaluates the isolated-vm native addon', () => {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', probeScript, startEntry], {
      encoding: 'utf8',
      timeout: 15_000,
    })
    expect(result.status).toBe(0)
    const lastLine = result.stdout.trim().split('\n').at(-1) ?? ''
    const loaded = LoadedSchema.parse(JSON.parse(lastLine))
    expect(loaded.cached).toEqual([])
    expect(loaded.shared).toEqual([])
  }, 20_000)
})
