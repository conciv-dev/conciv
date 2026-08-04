import {afterEach, describe, expect, it} from 'vitest'
import {interactiveTerminal} from '../src/init/wizard.js'

const restores: (() => void)[] = []

function fakeTty(stream: {isTTY?: boolean}, value: boolean): void {
  const original = stream.isTTY
  restores.push(() => {
    stream.isTTY = original
  })
  stream.isTTY = value
}

afterEach(() => {
  for (const restore of restores.splice(0)) restore()
})

describe('interactiveTerminal', () => {
  it('is not interactive when stdout is a terminal but stdin is not', () => {
    fakeTty(process.stdout, true)
    fakeTty(process.stdin, false)
    expect(interactiveTerminal()).toBe(false)
  })

  it('is not interactive when stdin is a terminal but stdout is redirected', () => {
    fakeTty(process.stdout, false)
    fakeTty(process.stdin, true)
    expect(interactiveTerminal()).toBe(false)
  })

  it('is interactive when both streams are terminals outside CI', () => {
    const ci = process.env.CI
    restores.push(() => {
      if (ci === undefined) delete process.env.CI
      else process.env.CI = ci
    })
    delete process.env.CI
    fakeTty(process.stdout, true)
    fakeTty(process.stdin, true)
    expect(interactiveTerminal()).toBe(true)
  })
})
