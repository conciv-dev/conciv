import {mkdtempSync, readFileSync, realpathSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {dirname, join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {installConcivBinShim} from '../src/core/bin-shim.js'

describe('installConcivBinShim', () => {
  it('symlinks the agent-facing conciv shim to the bare conciv package bin', () => {
    const stateDir = mkdtempSync(join(tmpdir(), 'conciv-bin-shim-'))
    const agentPath = installConcivBinShim(stateDir)
    expect(agentPath.startsWith(join(stateDir, 'bin'))).toBe(true)
    const target = realpathSync(join(stateDir, 'bin', 'conciv'))
    expect(target.endsWith(join('packages', 'cli', 'dist', 'bin.js'))).toBe(true)
    const manifest = readFileSync(join(dirname(dirname(target)), 'package.json'), 'utf8')
    expect(manifest).toContain('"name": "conciv"')
  })
})
