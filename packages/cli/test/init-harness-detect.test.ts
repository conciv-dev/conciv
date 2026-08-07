import {chmodSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {delimiter, join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {detectHarnesses} from '../src/init/harness-detect.js'

const dir = (label: string): string => mkdtempSync(join(tmpdir(), `conciv-harness-${label}-`))

const shim = (binDir: string, name: string): void => {
  const file = join(binDir, name)
  writeFileSync(file, '#!/bin/sh\nexit 0\n')
  chmodSync(file, 0o755)
}

describe('detectHarnesses', () => {
  it('finds a harness by an executable shim on PATH', () => {
    const binDir = dir('bin')
    const home = dir('home')
    shim(binDir, 'claude')
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'claude', via: 'path'}])
  })
  it('finds a harness by its config marker under HOME', () => {
    const binDir = dir('bin')
    const home = dir('home')
    mkdirSync(join(home, '.codex'))
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'codex', via: 'config'}])
  })
  it('finds opencode by its nested config marker', () => {
    const binDir = dir('bin')
    const home = dir('home')
    mkdirSync(join(home, '.config', 'opencode'), {recursive: true})
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'opencode', via: 'config'}])
  })
  it('reports a single entry with via path when both mechanisms hit', () => {
    const binDir = dir('bin')
    const home = dir('home')
    shim(binDir, 'pi')
    mkdirSync(join(home, '.pi'))
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'pi', via: 'path'}])
  })
  it('ignores a PATH file without the exec bit', () => {
    const binDir = dir('bin')
    const home = dir('home')
    const file = join(binDir, 'codex')
    writeFileSync(file, 'not a binary')
    chmodSync(file, 0o644)
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([])
  })
  it('walks multiple PATH entries', () => {
    const emptyDir = dir('empty')
    const binDir = dir('bin')
    const home = dir('home')
    shim(binDir, 'opencode')
    expect(detectHarnesses({PATH: [emptyDir, binDir].join(delimiter), HOME: home})).toEqual([
      {id: 'opencode', via: 'path'},
    ])
  })
  it('finds gemini-cli by its gemini binary on PATH', () => {
    const binDir = dir('bin')
    const home = dir('home')
    shim(binDir, 'gemini')
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'gemini-cli', via: 'path'}])
  })
  it('finds gemini-cli by its config marker under HOME', () => {
    const binDir = dir('bin')
    const home = dir('home')
    mkdirSync(join(home, '.gemini'))
    expect(detectHarnesses({PATH: binDir, HOME: home})).toEqual([{id: 'gemini-cli', via: 'config'}])
  })
  it('returns an empty list when nothing is installed', () => {
    expect(detectHarnesses({PATH: dir('bin'), HOME: dir('home')})).toEqual([])
  })
})
