import {createRoot, createEffect, onMount, type JSX} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import {defineEffect} from '@mandarax/extensions'
import {createClientDb} from '../../src/db/client-db.js'
import {createClientSync} from '../../src/sync/client-sync.js'
import {createRunTool} from '../../src/run-tool.js'
import {createEffectsHost} from '../../src/effects-host.js'
import type {Refs} from '../../src/page-snapshot.js'

type Note = {cid: string; body: string}

declare global {
  interface Window {
    __CORE__: string
    __PREVIEW_ID__: string
  }
}

const core = window.__CORE__
const previewId = window.__PREVIEW_ID__
const refs: Refs = {map: new Map(), n: 0}
const db = createClientDb(core)
const notes = db.collection<Note>('probe_notes', {parse: {}, serialize: {}})
const sync = createClientSync(core, '', {persist: false})
const runTool = createRunTool(core, () => ({}))
const host = createEffectsHost({apiBase: core, refs, runTool, db, sync, previewId, sessionId: () => null})

const probeEffect = defineEffect({
  name: 'runtool-probe',
  label: 'RunTool probe',
  description: 'Calls runTool from EffectCtx and shows the preview id',
  render: (ctx): JSX.Element => {
    onMount(() => void ctx.runTool('probe.add', {cid: crypto.randomUUID(), body: 'effect-row'}))
    const p = document.createElement('p')
    p.setAttribute('data-preview', '')
    p.textContent = `preview ${ctx.previewId}`
    return p
  },
})

createRoot(() => {
  const rows = useLiveQuery((q) => q.from({n: notes}))
  createEffect(() => {
    const list = document.getElementById('rows')
    if (!list) return
    list.replaceChildren(
      ...rows.data.map((note) => {
        const li = document.createElement('li')
        li.textContent = note.body
        return li
      }),
    )
  })
})

host.applyEffects([probeEffect])
host.effectHandler({
  query: {requestId: 'e1', kind: 'effect', action: 'enable', effect: 'runtool-probe'},
  el: null,
  refs,
  consoleBuf: [],
})
