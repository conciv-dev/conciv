import {mkdtempSync, rmSync, statSync, utimesSync, writeFileSync} from 'node:fs'
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

describe('the running engine stamp', () => {
  it('watches the server packages this process actually loaded and finds them fresh at boot', () => {
    const now = engineStaleness()

    expect(now.tracked).toContain('@conciv/core')
    expect(now.tracked).toContain('@conciv/tools')
    expect(now.stale).toBe(false)
    expect(now.changed).toEqual([])
  })
})
