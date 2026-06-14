import {describe, it, expect} from 'vitest'
import {classifyCommand} from '../src/policy/command-policy.js'

describe('classifyCommand', () => {
  it('allows read-only commands and gates mutating ones', () => {
    expect(classifyCommand('ls -la')).toBe('allow')
    expect(classifyCommand('git status')).toBe('allow')
    expect(classifyCommand('git push')).toBe('ask')
    expect(classifyCommand('rm -rf dist')).toBe('ask')
  })

  it('allows the agent CLIs, but still gates them when composed with a pipe or redirect', () => {
    expect(classifyCommand('aidx tools page snapshot')).toBe('allow')
    expect(classifyCommand('aidx tools page changes | tee evil.txt')).toBe('ask')
    expect(classifyCommand('aidx ui confirm --question x > out')).toBe('ask')
  })
})
