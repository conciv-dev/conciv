import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../../src/chat/gate.js'

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classifyCommand('ls')).toBe('allow')
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git status --short')).toBe('allow')
    expect(classifyCommand('git push')).toBe('ask')
    expect(classifyCommand('rm file')).toBe('ask')
    expect(classifyCommand('rm -rf dist')).toBe('ask')
    expect(classifyCommand('')).toBe('ask')
  })

  it('never lets a safe prefix hide a risky suffix behind a shell metacharacter', () => {
    expect(classifyCommand('ls; rm -rf /')).toBe('ask')
    expect(classifyCommand('ls;rm -rf /')).toBe('ask')
    expect(classifyCommand('cat a | sh')).toBe('ask')
    expect(classifyCommand('true && rm -rf /')).toBe('ask')
    expect(classifyCommand('echo $(rm -rf /)')).toBe('ask')
    expect(classifyCommand('ls `rm -rf /`')).toBe('ask')
    expect(classifyCommand('echo hi > /etc/passwd')).toBe('ask')
    expect(classifyCommand('head < secret')).toBe('ask')
    expect(classifyCommand('ls -la\nrm -rf /')).toBe('ask')
    expect(classifyCommand('ls a\nb\nrm -rf /')).toBe('ask')
  })

  it('allows the agent CLI, but still gates it when composed with a pipe or redirect', () => {
    expect(classifyCommand('conciv tools page snapshot')).toBe('allow')
    expect(classifyCommand('conciv tools page changes | tee evil.txt')).toBe('ask')
    expect(classifyCommand('conciv ui confirm --question x')).toBe('ask')
  })
})
