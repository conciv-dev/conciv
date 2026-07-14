import {describe, expect, it} from 'vitest'
import {EXTENSIONS_RESOLVED_ID, EXTENSIONS_VIRTUAL_ID} from '@conciv/extension-compiler/extensions'
import {EXTENSIONS_ROUTE} from '../src/core/widget-middleware.js'
import {makeViteHook} from '../src/core/vite.js'

describe('conciv vite extensions module route', () => {
  it('resolves the html-injected extensions URL to the virtual module graph entry', async () => {
    const plugin = makeViteHook()
    if (typeof plugin.resolveId !== 'function') throw new Error('resolveId hook missing')
    await expect(
      plugin.resolveId.call(resolveContext(), `${EXTENSIONS_ROUTE}?v=1`, '/index.html', {isEntry: false}),
    ).resolves.toBe(EXTENSIONS_RESOLVED_ID)
  })

  it('still resolves direct virtual imports to the same module', async () => {
    const plugin = makeViteHook()
    if (typeof plugin.resolveId !== 'function') throw new Error('resolveId hook missing')
    await expect(
      plugin.resolveId.call(resolveContext(), EXTENSIONS_VIRTUAL_ID, undefined, {isEntry: false}),
    ).resolves.toBe(EXTENSIONS_RESOLVED_ID)
  })
})

type ResolveHook = NonNullable<ReturnType<typeof makeViteHook>['resolveId']>
type ResolveFn = Extract<ResolveHook, (...args: never[]) => unknown>
type ResolveContext = ThisParameterType<ResolveFn>

function resolveContext(): ResolveContext {
  return {resolve: async () => null} as unknown as ResolveContext
}
