import {createRoot, createEffect} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import {createClientDb} from '../../src/db/client-db.js'
import {createRunTool, createRunToolApproved, isNeedsApproval} from '../../src/run-tool.js'

type Note = {cid: string; body: string}

declare global {
  interface Window {
    __CORE__: string
  }
}

const core = window.__CORE__
const db = createClientDb(core)
const notes = db.collection<Note>('probe_notes', {parse: {}, serialize: {}})
const runTool = createRunTool(core, () => ({}))
const runToolApproved = createRunToolApproved(core, () => ({}))
const CID = 'gone'

const setStatus = (text: string): void => {
  const el = document.getElementById('status')
  if (el) el.textContent = text
}

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

const del = document.getElementById('del')
if (del)
  del.addEventListener('click', async () => {
    const res = await runTool('probe.del', {cid: CID})
    setStatus(isNeedsApproval(res) ? 'needs-approval' : 'ran-without-approval')
  })

const allow = document.getElementById('allow')
if (allow) allow.addEventListener('click', () => void runToolApproved('probe.del', {cid: CID}))

void runTool('probe.add', {cid: CID, body: 'to-delete'})
