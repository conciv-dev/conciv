import {describe, it, expect} from 'vitest'
import {buildCodexArgs} from '../src/codex/args.js'
import type {HarnessTurn} from '@devgent/protocol/harness-types'

const base: HarnessTurn = {prompt: 'fix the bug', cwd: '/repo', resumeSessionId: null, systemPrompt: ''}

describe('codex buildArgs', () => {
  it('invokes `exec` with the prompt and the JSON-events + workspace-write sandbox flags', () => {
    const args = buildCodexArgs(base)
    expect(args[0]).toBe('exec')
    expect(args).toContain('fix the bug')
    expect(args).toContain('--json')
    expect(args[args.indexOf('--sandbox') + 1]).toBe('workspace-write')
  })

  it('resumes a prior session via the `exec resume <id>` subcommand', () => {
    const args = buildCodexArgs({...base, resumeSessionId: 'thread-1'})
    expect(args.slice(0, 4)).toEqual(['exec', 'resume', 'thread-1', 'fix the bug'])
  })

  it('never adds a --settings/permission hook (permissionGate is none)', () => {
    const args = buildCodexArgs({...base, permissionUrl: 'http://h/api/chat/permission'})
    expect(args).not.toContain('--settings')
    expect(args.join(' ')).not.toContain('permission')
  })
})
