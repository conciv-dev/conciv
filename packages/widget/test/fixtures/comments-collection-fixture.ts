import {createRoot, createEffect} from 'solid-js'
import {useLiveQuery} from '@tanstack/solid-db'
import {commentParse, commentSerialize, type Comment, type CommentRecord} from '@mandarax/whiteboard'
import {createClientDb} from '../../src/db/client-db.js'

const db = createClientDb(location.origin)
const comments = db.collection<Comment, CommentRecord>('comments', {
  parse: commentParse,
  serialize: commentSerialize,
})

const firstText = (comment: Comment): string => {
  const part = comment.parts[0]
  if (part && typeof part === 'object' && 'text' in part) return String((part as {text: unknown}).text)
  return '(no text)'
}

createRoot(() => {
  const rows = useLiveQuery((q) => q.from({c: comments}))
  createEffect(() => {
    const list = document.getElementById('rows')
    if (!list) return
    list.replaceChildren(
      ...rows.data.map((comment) => {
        const li = document.createElement('li')
        const dateOk = comment.created_at instanceof Date && !Number.isNaN(comment.created_at.getTime())
        li.textContent = `${firstText(comment)}::${dateOk ? 'date-ok' : 'date-bad'}`
        return li
      }),
    )
  })
  createEffect(() => {
    const status = document.getElementById('status')
    if (status) status.textContent = rows.isReady ? 'sync-ready' : 'sync-pending'
  })
})
