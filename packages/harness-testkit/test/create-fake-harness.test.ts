import {describe, expect, it} from 'vitest'
import {createFakeHarness} from '../src/create-fake-harness.js'

describe('createFakeHarness tty', () => {
  it('has no tty by default', () => {
    expect(createFakeHarness().tty).toBeUndefined()
  })

  it('exposes an injected tty command', () => {
    const command = () => ({bin: 'bash', args: ['-i'], env: {}})
    const harness = createFakeHarness({tty: {command}})
    expect(harness.tty?.command({cwd: '/', harnessSessionId: 's', resume: false}).bin).toBe('bash')
  })
})
