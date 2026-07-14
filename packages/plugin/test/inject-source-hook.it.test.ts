import {describe, it, expect} from 'vitest'
import type {Plugin} from 'vite'
import {makeViteHook} from '../src/core/vite.js'
import {EXTENSIONS_ROUTE} from '../src/core/widget-middleware.js'

const ROOT = '/proj'

function transformViaHook(peerPlugins: {name: string}[]): {code: string} | null {
  const hook = makeViteHook({enabled: true})
  const configResolved = hook.configResolved
  if (typeof configResolved === 'function')
    configResolved.call({} as never, {root: ROOT, plugins: peerPlugins} as never)
  const transform = hook.transform
  const run = typeof transform === 'function' ? transform : transform?.handler
  if (!run) throw new Error('conciv plugin has no transform')
  const result = run.call(
    {} as never,
    'export const A = () => <div>hi</div>\n',
    `${ROOT}/src/App.tsx`,
    undefined as never,
  )
  return result as {code: string} | null
}

const reactPlugin: Plugin = {name: 'vite:react'}
const tsdInjectSource: Plugin = {name: '@tanstack/devtools:inject-source'}

describe('makeViteHook source injection', () => {
  it('resolves the injected extensions script URL into the module graph', async () => {
    const hook = makeViteHook({enabled: true})
    const resolveId = hook.resolveId
    const run = typeof resolveId === 'function' ? resolveId : resolveId?.handler
    if (!run) throw new Error('conciv plugin has no resolveId')
    const out = await run.call({} as never, EXTENSIONS_ROUTE, undefined as never, {} as never)
    expect(out).toBe('\0virtual:conciv-extensions')
  })

  it('stamps data-conciv-source when no @tanstack/devtools source injector is present', () => {
    const out = transformViaHook([reactPlugin])
    expect(out?.code).toContain('data-conciv-source=')
  })

  it('defers to @tanstack/devtools (no data-conciv-source) when its inject-source plugin is present', () => {
    const out = transformViaHook([reactPlugin, tsdInjectSource])
    expect(out).toBeNull()
  })
})
