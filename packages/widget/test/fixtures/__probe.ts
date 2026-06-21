import {z} from 'zod'
import {defineExtension, defineTool} from '@mandarax/extensions'

const NoteSchema = z.object({cid: z.string(), body: z.string()})
const DelInput = z.object({cid: z.string()})
const Empty = z.object({})

export default defineExtension({id: 'probe'})
  .server((mx) => {
    const notes = mx.db.collection('probe_notes', {schema: NoteSchema, columns: 'body TEXT NOT NULL', fts: ['body']})
    mx.sync.room('probe')
    let started = false
    mx.on('session_start', () => void (started = true))
    mx.approval('probe.del', 'ask')
    mx.registerTool(
      defineTool({
        name: 'probe.add',
        label: 'Probe add',
        description: 'Insert a probe note.',
        parameters: NoteSchema,
        execute: (input) => notes.insert(input),
      }),
    )
    mx.registerTool(
      defineTool({
        name: 'probe.del',
        label: 'Probe delete',
        description: 'Delete a probe note (approval-gated).',
        parameters: DelInput,
        execute: (input) => notes.delete(input.cid),
      }),
    )
    mx.registerTool(
      defineTool({
        name: 'probe.status',
        label: 'Probe status',
        description: 'Whether session_start has fired.',
        parameters: Empty,
        execute: () => started,
      }),
    )
  })
  .client((mx) => {
    mx.registerComposerAction({
      id: 'probe-add',
      label: 'Add probe note',
      icon: () => null,
      onClick: (ctx) => void ctx.runTool('probe.add', {cid: crypto.randomUUID(), body: 'composer-row'}),
    })
  })
