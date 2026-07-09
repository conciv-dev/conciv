import {createSignal, For} from 'solid-js'
import {z} from 'zod'
import {defineExtension, type ExtensionTableDecl} from '@conciv/extension'
import {useHost, useSlot} from '@conciv/extension/client'
import {uuidv7Base64} from '@conciv/db'

const tables: readonly ExtensionTableDecl[] = [
  {name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`},
]

const NoteRowSchema = z.object({id: z.string(), session_id: z.string(), body: z.string()})
type NoteRow = z.infer<typeof NoteRowSchema>

function Fixture() {
  const host = useHost()
  const slot = useSlot()
  const notes = host.state.table('notes')
  const [rows, setRows] = createSignal<NoteRow[]>([])
  const refresh = () => void notes.toArrayWhenReady().then((raw) => setRows(raw.map((row) => NoteRowSchema.parse(row))))
  return (
    <section>
      <output data-slot>{slot()}</output>
      <button
        onClick={() => {
          notes.insert({id: uuidv7Base64(), session_id: host.state.activeSession() ?? 'conciv_none', body: 'from-client'})
        }}
      >
        add note
      </button>
      <button onClick={() => host.chat.send('hello-from-fixture')}>send chat</button>
      <ul data-notes>
        <For each={rows()}>{(row) => <li>{row.body}</li>}</For>
      </ul>
      <button onClick={refresh}>refresh</button>
    </section>
  )
}

export default defineExtension({name: 'host-api-fixture', tables, Component: Fixture})
