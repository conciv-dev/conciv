import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {describe, expect, it} from 'vitest'

const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url))

const PROBE = `
import {registerHooks} from 'node:module'
const resolved = []
registerHooks({resolve: (specifier, context, next) => {
  resolved.push(specifier)
  return next(specifier, context)
}})
const entry = await import('@conciv/plugin/nextjs')
await entry.register()
console.log(JSON.stringify({resolved, exports: Object.keys(entry)}))
`

function probeEdgeEntry(): {resolved: string[]; exports: string[]} {
  const output = execFileSync(process.execPath, ['--conditions=edge-light', '--input-type=module', '-e', PROBE], {
    cwd: PACKAGE_ROOT,
    env: {...process.env, NEXT_RUNTIME: 'edge'},
    encoding: 'utf8',
  })
  return JSON.parse(output)
}

describe('next.js instrumentation entry under the edge runtime', () => {
  it('resolves to a register with no node builtins and no extension compiler in its module graph', () => {
    const probe = probeEdgeEntry()
    expect(probe.exports).toContain('register')
    expect(probe.resolved.filter((specifier) => specifier.startsWith('node:'))).toEqual([])
    expect(probe.resolved.filter((specifier) => specifier.includes('extension-compiler'))).toEqual([])
  })
})
