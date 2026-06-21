import {describe, expect, it} from 'vitest'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {makeEffects} from '../src/page-effects.js'

function seamCtx(): Omit<EffectCtx, 'disable'> {
  return {
    page: {
      elementAt: () => null,
      componentHostAt: () => null,
      describe: () => ({component: '', file: null}),
      locate: async () => null,
      inspect: async () => null,
      tree: async () => ({nodes: [], truncated: 0}),
      find: () => ({matches: [], total: 0}),
      addRef: () => 'r0',
    },
    openSource: async () => 'opened',
    toast: () => {},
    env: {reducedMotion: () => true, doc: {} as Document, win: {} as Window},
  }
}

describe('makeEffects', () => {
  it('lists effects from the getter with their own metadata + off state', () => {
    const fx = makeEffects(
      () => [defineEffect({name: 'demo', label: 'Demo', description: 'a demo effect', render: () => null})],
      seamCtx(),
    )
    expect(fx.listEffects().effects).toContainEqual({name: 'demo', description: 'a demo effect', enabled: false})
  })

  it('an unknown effect returns an error', () => {
    const fx = makeEffects(() => [], seamCtx())
    expect(fx.setEffect('nope', true)).toEqual({error: 'unknown effect: nope'})
  })
})
