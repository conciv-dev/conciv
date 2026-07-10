import {describe, expect, it} from 'vitest'
import {makeUiBus} from '../src/runtime/ui-bus.js'
import {makePermissionGate} from '../src/chat/permission.js'

describe('permission gate: self-declared risky tools', () => {
  const risky = new Set(['mcp__conciv__canvas.delete'])

  it('routes a risky extension tool through approval (fails closed with no live channel)', async () => {
    const gate = makePermissionGate(makeUiBus(), {risky})
    expect(await gate.decide('mcp__conciv__canvas.delete', {id: 'r1'}, 'conciv_x', 'tu1')).toBe('deny')
  })

  it('does not gate the unprefixed tool name (locks the prefixed-name form)', async () => {
    const gate = makePermissionGate(makeUiBus(), {risky})
    expect(await gate.decide('canvas.delete', {id: 'r1'}, 'conciv_x', 'tu2')).toBe('allow')
  })

  it('allows a safe tool outright (no injection)', async () => {
    const gate = makePermissionGate(makeUiBus(), {risky})
    expect(await gate.decide('Read', {path: '/x'}, 'conciv_x', 'tu3')).toBe('allow')
  })
})
