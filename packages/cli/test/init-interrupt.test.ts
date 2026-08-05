import {existsSync, mkdtempSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {captureFile, guardBackups, onInterrupt} from '../src/init/interrupt.js'

function scratchFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-interrupt-'))
  const path = join(dir, name)
  writeFileSync(path, content)
  return path
}

type SignalListeners = NodeJS.SignalsListener[]

function fireNewSigintListener(before: SignalListeners): void {
  const added = process.listeners('SIGINT').filter((listener) => !before.includes(listener))
  const listener = added[0]
  if (added.length !== 1 || listener === undefined) {
    throw new Error(`expected exactly one new SIGINT listener, found ${added.length}`)
  }
  listener('SIGINT')
}

describe('guardBackups', () => {
  it('restores every remembered file when restore runs, newest write last', () => {
    const first = scratchFile('vite.config.ts', 'first original')
    const second = scratchFile('next.config.ts', 'second original')
    const guard = guardBackups()
    guard.remember({path: first, content: 'first original'})
    guard.remember({path: second, content: 'second original'})
    writeFileSync(first, 'clobbered')
    writeFileSync(second, 'clobbered')
    guard.restore()
    guard.release()
    expect(readFileSync(first, 'utf8')).toBe('first original')
    expect(readFileSync(second, 'utf8')).toBe('second original')
  })

  it('restores remembered files when the process exits before release, and stops after release', () => {
    const path = scratchFile('vite.config.ts', 'original')
    const guard = guardBackups()
    guard.remember({path, content: 'original'})
    writeFileSync(path, 'clobbered mid-run')
    process.emit('exit', 0)
    expect(readFileSync(path, 'utf8')).toBe('original')
    guard.release()
    writeFileSync(path, 'after release')
    process.emit('exit', 0)
    expect(readFileSync(path, 'utf8')).toBe('after release')
  })

  it('removes a file the run created when the captured backup recorded it as absent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-interrupt-'))
    const created = join(dir, 'AGENTS.md')
    const guard = guardBackups()
    guard.remember(captureFile(created))
    writeFileSync(created, 'written mid-run')
    guard.restore()
    guard.release()
    expect(existsSync(created)).toBe(false)
  })

  it('captures the current content of a file that already exists', () => {
    const path = scratchFile('vite.config.ts', 'original')
    const guard = guardBackups()
    guard.remember(captureFile(path))
    writeFileSync(path, 'clobbered')
    guard.restore()
    guard.release()
    expect(readFileSync(path, 'utf8')).toBe('original')
  })

  it('leaves no exit listener behind after release', () => {
    const baseline = process.listeners('exit').length
    guardBackups().release()
    expect(process.listeners('exit').length).toBe(baseline)
  })
})

describe('onInterrupt', () => {
  it('registers a SIGINT listener that runs the handler and removes it on release', () => {
    const before = process.listeners('SIGINT')
    const fired: string[] = []
    const release = onInterrupt(() => {
      fired.push('interrupted')
    })
    fireNewSigintListener(before)
    expect(fired).toEqual(['interrupted'])
    release()
    expect(process.listeners('SIGINT')).toEqual(before)
  })

  it('restores a clobbered config when the interrupt handler runs a backup restore', () => {
    const path = scratchFile('vite.config.ts', 'original')
    const guard = guardBackups()
    guard.remember({path, content: 'original'})
    const before = process.listeners('SIGINT')
    const release = onInterrupt(() => {
      guard.restore()
    })
    writeFileSync(path, 'half-wired')
    fireNewSigintListener(before)
    expect(readFileSync(path, 'utf8')).toBe('original')
    release()
    guard.release()
  })
})
