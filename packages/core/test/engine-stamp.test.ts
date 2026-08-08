import {mkdtempSync, rmSync, utimesSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {engineStaleness, makeStalenessProbe} from '../src/lib/engine-stamp.js'

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

    ageForward(path, 5)

    expect(probe().stale).toBe(true)
    expect(probe().stale).toBe(true)
    expect(probe().changed).toEqual(['@conciv/core'])
  })
})

describe('the running engine stamp', () => {
  it('watches the server packages this process actually loaded and finds them fresh at boot', () => {
    const now = engineStaleness()

    expect(now.tracked).toContain('@conciv/core')
    expect(now.tracked).toContain('@conciv/tools')
    expect(now.stale).toBe(false)
    expect(now.changed).toEqual([])
  })
})
