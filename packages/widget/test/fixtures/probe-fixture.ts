import {createRoot, createEffect} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import type {ClientApi, ComposerActionCtx} from '@mandarax/extensions'
import {createClientDb} from '../../src/db/client-db.js'
import {createClientSync} from '../../src/sync/client-sync.js'
import {createRunTool} from '../../src/run-tool.js'
import probe from './__probe.js'

type Note = {cid: string; body: string}

declare global {
  interface Window {
    __CORE__: string
  }
}

const core = window.__CORE__
const db = createClientDb(core)
const notes = db.collection<Note>('probe_notes', {parse: {}, serialize: {}})
const sync = createClientSync(core, '', {persist: false})
const runTool = createRunTool(core, () => ({}))

const noop = (): void => {}
const composer: {onClick: ((ctx: ComposerActionCtx) => void | Promise<void>) | null} = {onClick: null}
const clientApi: ClientApi = {
  ui: {setTheme: noop, setWidget: noop, setHeader: noop, setFooter: noop, setStatus: noop, setEmptyState: noop},
  registerComposerAction: (action) => void (composer.onClick = action.onClick),
  db,
  sync,
  runTool,
  previewId: '',
  sessionId: () => null,
}
probe.clientFn?.(clientApi)

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
  createEffect(() => {
    const status = document.getElementById('status')
    if (status) status.textContent = rows.isReady ? 'db-ready' : 'db-pending'
  })
  const data = sync.room('probe').doc.getMap('data')
  data.observe(() => {
    const canvas = document.getElementById('canvas')
    if (canvas) canvas.textContent = String(data.get('pin') ?? '')
  })
})

if (new URLSearchParams(location.search).get('composer')) void composer.onClick?.({runTool, insert: noop, notify: noop})
