import {mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {basename, join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import getPort from 'get-port'
import {z} from 'zod'
import {engineStaleness, loadedModules, makeStalenessProbe} from '../src/lib/engine-stamp.js'
import {statePaths} from '../src/lib/state-paths.js'
import {start} from '../src/start.js'

const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function tmpFile(name: string, contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-stamp-'))
  dirs.push(dir)
  const path = join(dir, name)
  writeFileSync(path, contents)
  return path
}

function ageForward(path: string, seconds: number): void {
  const when = new Date(Date.now() + seconds * 1000)
  utimesSync(path, when, when)
}

describe('engine staleness probe', () => {
  it('reports fresh while every loaded file is untouched on disk', () => {
    const path = tmpFile('core.js', 'export const a = 1')

    const probe = makeStalenessProbe([{label: '@conciv/core', path}])

    expect(probe().stale).toBe(false)
    expect(probe().changed).toEqual([])
  })

  it('turns stale and names only the package whose file was rewritten on disk', () => {
    const core = tmpFile('core.js', 'export const a = 1')
    const tools = tmpFile('tools.js', 'export const b = 1')
    const probe = makeStalenessProbe([
      {label: '@conciv/core', path: core},
      {label: '@conciv/tools', path: tools},
    ])
    expect(probe().stale).toBe(false)

    writeFileSync(tools, 'export const b = 2')
    ageForward(tools, 5)

    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/tools'])
  })

  it('turns stale when a loaded file is removed from disk', () => {
    const path = tmpFile('core.js', 'export const a = 1')
    const probe = makeStalenessProbe([{label: '@conciv/core', path}])

    rmSync(path)

    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/core'])
  })

  it('keeps reporting stale on every later check instead of re-baselining after the first', () => {
    const path = tmpFile('core.js', 'export const a = 1')
    const probe = makeStalenessProbe([{label: '@conciv/core', path}])

    writeFileSync(path, 'export const a = 2')

    expect(probe().stale).toBe(true)
    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/core'])
  })

  it('stays fresh when a rebuild rewrites identical bytes and only moves the mtime forward', () => {
    const path = tmpFile('core.js', 'export const a = 1')
    const probe = makeStalenessProbe([{label: '@conciv/core', path}])

    writeFileSync(path, 'export const a = 1')
    ageForward(path, 5)

    expect(probe().stale).toBe(false)
    expect(probe().changed).toEqual([])
  })

  it('turns stale when the bytes changed even though the mtime was put back', () => {
    const path = tmpFile('core.js', 'export const a = 1')
    const before = statSync(path)
    const probe = makeStalenessProbe([{label: '@conciv/core', path}])

    writeFileSync(path, 'export const a = 2')
    utimesSync(path, before.atime, before.mtime)

    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/core'])
  })

  it('holds one fingerprint while nothing moves and mints a new one after a rebuild', () => {
    const path = tmpFile('core.js', 'export const a = 1')
    const probe = makeStalenessProbe([{label: '@conciv/core', path}])
    const first = probe().fingerprint

    expect(probe().fingerprint).toBe(first)

    writeFileSync(path, 'export const a = 2')

    expect(probe().fingerprint).not.toBe(first)
  })
})

describe('a package that ships more than one entry', () => {
  it('turns stale when an entry other than the one holding this module changes', () => {
    const chunk = tmpFile('app-hash.js', 'the chunk engine-stamp landed in')
    const config = tmpFile('config.js', 'a separate self-contained entry')
    const probe = makeStalenessProbe([
      {label: '@conciv/core', path: chunk},
      {label: '@conciv/core', path: config},
    ])
    expect(probe().stale).toBe(false)

    writeFileSync(config, 'a separate self-contained entry, rebuilt')

    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/core'])
  })

  it('names a package once however many of its entries moved', () => {
    const chunk = tmpFile('app-hash.js', 'chunk')
    const config = tmpFile('config.js', 'config')
    const probe = makeStalenessProbe([
      {label: '@conciv/core', path: chunk},
      {label: '@conciv/core', path: config},
    ])

    writeFileSync(chunk, 'chunk rebuilt')
    writeFileSync(config, 'config rebuilt')

    expect(probe().changed).toEqual(['@conciv/core'])
  })
})

describe('the running engine stamp', () => {
  it('watches every published core entry, not just the chunk this module landed in', () => {
    const coreFiles = loadedModules()
      .filter((entry) => entry.label === '@conciv/core')
      .map((entry) => basename(entry.path))

    expect(coreFiles).toContain('config.js')
    expect(coreFiles.length).toBeGreaterThan(1)
  })

  it('watches the server packages this process actually loaded and finds them fresh at boot', () => {
    const now = engineStaleness()

    expect(now.tracked).toContain('@conciv/core')
    expect(now.tracked).toContain('@conciv/tools')
    expect(now.stale).toBe(false)
    expect(now.changed).toEqual([])
  })
})

const EndpointSchema = z.object({mcpUrl: z.string()})

function recordedEndpoint(root: string): z.infer<typeof EndpointSchema> {
  return EndpointSchema.parse(JSON.parse(readFileSync(join(statePaths(root).dir, 'mcp-endpoint.json'), 'utf8')))
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'endpoint-test', version: '0.0.0'}},
}

describe('boot writes .conciv/mcp-endpoint.json', () => {
  it('start records the MCP endpoint a headless stdio bridge reads, and the endpoint answers', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-mcp-'))
    try {
      const engine = await start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}})
      try {
        const {mcpUrl} = recordedEndpoint(root)
        expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/api/mcp`)
        expect(statSync(join(statePaths(root).dir, 'mcp-endpoint.json')).mode & 0o777).toBe(0o600)
        const response = await fetch(mcpUrl, {
          method: 'POST',
          headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
          body: JSON.stringify(initialize),
        })
        expect(response.status).toBe(200)
        await response.body?.cancel()
      } finally {
        await engine.stop()
      }
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })

  it('releases the port when the endpoint file cannot be written', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-engine-mcp-'))
    const port = await getPort()
    try {
      mkdirSync(join(statePaths(root).dir, 'mcp-endpoint.json'), {recursive: true})
      await expect(
        start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}, port: {exact: port}}),
      ).rejects.toThrow()
      const probe = createServer()
      await new Promise<void>((resolve, reject) => {
        probe.once('error', reject)
        probe.listen(port, '127.0.0.1', () => resolve())
      })
      await new Promise<void>((resolve) => probe.close(() => resolve()))
    } finally {
      rmSync(root, {recursive: true, force: true})
    }
  })
})
