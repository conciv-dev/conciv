import {mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {makeApp, type MadeApp} from '../../src/app.js'

const cleanups: (() => Promise<void> | void)[] = []

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.()
})

async function get(app: MadeApp['app'], path: string): Promise<Response> {
  return await app.request(`http://127.0.0.1${path}`, {headers: {host: '127.0.0.1'}})
}

async function bootApp(widgetBundleFile: string | undefined): Promise<MadeApp['app']> {
  const stateRoot = mkdtempSync(join(tmpdir(), 'conciv-widget-asset-'))
  const made = await makeApp({
    cfg: {
      enabled: true,
      stateRoot,
      harness: 'claude',
      harnessBin: undefined,
      sessionId: '',
      systemPrompt: '',
      extensions: undefined,
    },
    cwd: stateRoot,
    openInEditor: () => {},
    widgetBundleFile,
  })
  cleanups.push(async () => {
    await made.dispose()
    rmSync(stateRoot, {recursive: true, force: true})
  })
  return made.app
}

function writeBundle(): {file: string} {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-widget-dist-'))
  cleanups.push(() => rmSync(dir, {recursive: true, force: true}))
  const file = join(dir, 'conciv-widget.global.js')
  writeFileSync(file, 'var ConcivWidget={mounted:true}\n//# sourceMappingURL=conciv-widget.global.js.map\n')
  writeFileSync(`${file}.map`, '{"version":3,"mappings":""}')
  return {file}
}

describe('engine widget bundle route', () => {
  it('serves the prebuilt bundle at /widget.js with script content-type and dev caching', async () => {
    const {file} = writeBundle()
    const app = await bootApp(file)
    const res = await get(app, '/widget.js')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(res.headers.get('cache-control')).toBe('no-cache')
    expect(await res.text()).toContain('ConcivWidget={mounted:true}')
  })

  it('serves the sourcemap the bundle tail points at', async () => {
    const {file} = writeBundle()
    const app = await bootApp(file)
    const res = await get(app, '/conciv-widget.global.js.map')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(await res.text()).toContain('"version":3')
  })

  it('404s when the bundle file is missing on disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-widget-missing-'))
    cleanups.push(() => rmSync(dir, {recursive: true, force: true}))
    const app = await bootApp(join(dir, 'conciv-widget.global.js'))
    const res = await get(app, '/widget.js')
    expect(res.status).toBe(404)
  })

  it('404s when the engine is booted without a bundle file', async () => {
    const app = await bootApp(undefined)
    const res = await get(app, '/widget.js')
    expect(res.status).toBe(404)
  })
})
