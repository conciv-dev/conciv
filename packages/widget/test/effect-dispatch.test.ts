import {describe, expect, it} from 'vitest'
import {defineEffect, type EffectCtx} from '@mandarax/extensions'
import {makeEffects} from '../src/page-effects.js'
import {createClientDb} from '../src/db/client-db.js'
import {createClientSync} from '../src/sync/client-sync.js'
import {createRunTool} from '../src/run-tool.js'

const seamBase = 'http://127.0.0.1'

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
    runTool: createRunTool(seamBase, () => ({})),
    db: createClientDb(seamBase),
    sync: createClientSync(seamBase, '', {persist: false}),
    previewId: '',
    sessionId: () => null,
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
