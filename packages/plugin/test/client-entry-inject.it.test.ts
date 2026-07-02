import {describe, expect, it} from 'vitest'
import {EXTENSIONS_VIRTUAL_ID, extensionsModuleSource} from '../src/core/extensions.js'
import {isClientEntry, transformConcivModule} from '../src/core/vite-plumbing.js'

const CTX = {root: '/app', deferToTsd: false}

describe('client-entry module-graph injection', () => {
  it('matches framework client-entry ids, not ordinary modules', () => {
    expect(isClientEntry('virtual:tanstack-start-dev-client-entry')).toBe(true)
    expect(isClientEntry('\0virtual:tanstack-start-client-entry')).toBe(true)
    expect(isClientEntry('/src/main.tsx')).toBe(false)
    expect(isClientEntry('/src/routes/__root.tsx')).toBe(false)
  })

  it('appends a dynamic import of the extensions module to the client entry (not hoisted above the preamble)', () => {
    const out = transformConcivModule(
      'await import("/entry.client.tsx")',
      'virtual:tanstack-start-dev-client-entry',
      false,
      CTX,
    )
    expect(out).not.toBeNull()
    const code = (out as {code: string}).code
    expect(code).toContain(`import(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})`)
    expect(code).not.toMatch(new RegExp(`^\\s*import\\s+['"]${EXTENSIONS_VIRTUAL_ID}`, 'm'))
  })

  it('does not inject on the SSR pass (the entry is client-only)', () => {
    const out = transformConcivModule(
      'await import("/entry.client.tsx")',
      'virtual:tanstack-start-dev-client-entry',
      true,
      CTX,
    )
    if (out && 'code' in out) expect(out.code).not.toContain(EXTENSIONS_VIRTUAL_ID)
  })

  it('does not double-inject when the entry already imports the extensions module (HMR re-transform)', () => {
    const already = `await import("/entry.client.tsx")\nimport(${JSON.stringify(EXTENSIONS_VIRTUAL_ID)})\n`
    const out = transformConcivModule(already, 'virtual:tanstack-start-dev-client-entry', false, CTX)
    expect(out).toBeNull()
  })

  it('bakes the engine origin into the extensions module as the window global (Next-style seam)', () => {
    const source = extensionsModuleSource(['/abs/a/client.js'], 'http://127.0.0.1:41700')
    expect(source).toContain('window.__CONCIV_API_BASE__ = "http://127.0.0.1:41700"')
    expect(source).toContain('mountWidget([builtin0, ...userExtensions])')
  })

  it('omits the window global when no api base is known (classic path uses the meta tag)', () => {
    const source = extensionsModuleSource(['/abs/a/client.js'])
    expect(source).not.toContain('__CONCIV_API_BASE__')
  })
})
