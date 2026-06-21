import {createRoot, createEffect} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import {createClientDb} from '../../src/db/client-db.js'

type Note = {cid: string; body: string}

const db = createClientDb(location.origin)
const notes = db.collection<Note>('notes', {parse: {}, serialize: {}})

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
    if (status) status.textContent = rows.isReady ? 'sync-ready' : 'sync-pending'
  })
})

notes.insert({cid: '11111111-1111-7111-8111-111111111111', body: 'optimistic-row'})
