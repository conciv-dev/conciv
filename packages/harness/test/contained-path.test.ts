import {mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {HarnessSessionId} from '@conciv/protocol/chat-types'
import {claudeHistory, encodeProjectDir} from '../src/claude/history.js'
import {containedPath, transcriptPathWithin} from '../src/_shared/contained-path.js'

const UncheckedHarnessSessionId = z.string().brand<'HarnessSessionId'>()

const scratch: string[] = []

afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, {recursive: true, force: true})
})

function claudeHome(cwd: string): string {
  const home = mkdtempSync(join(tmpdir(), 'conciv-contain-home-'))
  scratch.push(home)
  mkdirSync(join(home, '.claude', 'projects', encodeProjectDir(cwd)), {recursive: true})
  return home
}

describe('containedPath refuses anything that lands outside the root', () => {
  it('accepts a plain child', () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
    scratch.push(root)
    expect(containedPath(root, join(root, 'a.jsonl'))).not.toBeNull()
  })

  it('refuses the root itself and a traversal out of it', () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
    scratch.push(root)
    expect(containedPath(root, root)).toBeNull()
    expect(containedPath(root, join(root, '..', 'secret.jsonl'))).toBeNull()
    expect(containedPath(root, join(root, 'a', '..', '..', 'secret.jsonl'))).toBeNull()
  })

  it('refuses a symlink inside the root that points outside it', () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-contain-'))
    const outside = mkdtempSync(join(tmpdir(), 'conciv-outside-'))
    scratch.push(root, outside)
    const secret = join(outside, 'secret.jsonl')
    writeFileSync(secret, 'TOP SECRET')
    symlinkSync(secret, join(root, 'escape.jsonl'))
    expect(containedPath(root, join(root, 'escape.jsonl'))).toBeNull()
  })
})

describe('transcriptPathWithin contains a charset-valid harness session id', () => {
  it('yields a path for an ordinary token', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
    scratch.push(cwd)
    const home = claudeHome(cwd)
    const token = HarnessSessionId.parse('018f3a2b-4c5d-6e7f')
    writeFileSync(join(home, '.claude', 'projects', encodeProjectDir(cwd), `${token}.jsonl`), '')
    expect(transcriptPathWithin(claudeHistory, cwd, token, home)).not.toBeNull()
  })

  it('refuses a token whose transcript is a symlink out of the project directory', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
    const outside = mkdtempSync(join(tmpdir(), 'conciv-outside-'))
    scratch.push(cwd, outside)
    const home = claudeHome(cwd)
    const secret = join(outside, 'secret.jsonl')
    writeFileSync(secret, 'TOP SECRET')
    const token = HarnessSessionId.parse('018f3a2b-dead-beef')
    symlinkSync(secret, join(home, '.claude', 'projects', encodeProjectDir(cwd), `${token}.jsonl`))
    expect(transcriptPathWithin(claudeHistory, cwd, token, home)).toBeNull()
  })

  it('refuses a traversing token even when the brand parse is bypassed', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
    scratch.push(cwd)
    const home = claudeHome(cwd)
    const traversal = UncheckedHarnessSessionId.parse('../../secret')
    expect(transcriptPathWithin(claudeHistory, cwd, traversal, home)).toBeNull()
  })

  it('yields nothing for a history that declares no transcript path', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'conciv-project-'))
    scratch.push(cwd)
    const pathless = {...claudeHistory, transcriptPath: undefined, transcriptRoot: undefined}
    expect(transcriptPathWithin(pathless, cwd, HarnessSessionId.parse('tok'), claudeHome(cwd))).toBeNull()
  })
})
