import {describe, it, expect, vi} from 'vitest'
import {z} from 'zod'
import {defineExtension} from '../src/define-extension.js'
import {defineTool} from '../src/define-tool.js'
import {collectToolRenderers, collectClientEffects} from '../src/collect-client.js'
import type {ClientEffect} from '../src/types.js'

const Card = () => null
const draw = defineTool({name: 'draw', description: 'd', inputSchema: z.object({})}).render(Card)

function makeEffect(name: string): ClientEffect {
  let enabled = false
  return {name, description: `${name} effect`, enabled: () => enabled, set: (value) => (enabled = value)}
}

describe('collectToolRenderers', () => {
  it('returns a render entry per tool that has a .render() card', () => {
    const entries = collectToolRenderers([defineExtension({name: 'canvas', tools: [draw]})])
    expect(entries).toHaveLength(1)
    expect(entries[0]?.names).toEqual(['draw'])
    expect(entries[0]?.render).toBe(Card)
  })

  it('skips tools without a render half', () => {
    const bare = defineTool({name: 'bare', description: 'd', inputSchema: z.object({})})
    expect(collectToolRenderers([defineExtension({name: 'x', tools: [bare]})])).toHaveLength(0)
  })

  it('dedups by name across extensions, first wins', () => {
    const a = defineExtension({name: 'a', tools: [draw]})
    const b = defineExtension({name: 'b', tools: [draw]})
    expect(collectToolRenderers([a, b])).toHaveLength(1)
  })
})

describe('collectClientEffects', () => {
  it('collects every effect across instances, keyed by name', () => {
    const banner = makeEffect('banner')
    const confetti = makeEffect('confetti')
    const entries = collectClientEffects([
      {name: 'a', effects: [banner]},
      {name: 'b', effects: [confetti]},
    ])
    expect(entries).toEqual([banner, confetti])
  })

  it('dedups by name across instances, first wins, and warns naming both the kept and dropped extension', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const kept = makeEffect('banner')
    const dropped = makeEffect('banner')
    const entries = collectClientEffects([
      {name: 'a', effects: [kept]},
      {name: 'b', effects: [dropped]},
    ])
    expect(entries).toEqual([kept])
    expect(warn).toHaveBeenCalledTimes(1)
    const [message] = warn.mock.calls[0] ?? []
    expect(message).toContain('"a"')
    expect(message).toContain('"b"')
    expect(message).toContain('banner')
    warn.mockRestore()
  })
})
