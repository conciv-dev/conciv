import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../src/chat/policy.js'

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git push')).toBe('ask')
    expect(classifyCommand('rm -rf dist')).toBe('ask')
  })

  it('allows the agent CLI, but still gates it when composed with a pipe or redirect', () => {
    expect(classifyCommand('conciv tools page snapshot')).toBe('allow')
    expect(classifyCommand('conciv tools page changes | tee evil.txt')).toBe('ask')
    expect(classifyCommand('conciv ui confirm --question x')).toBe('ask')
  })
})
