import {defineExtension} from '@mandarax/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {createSync, createMemorySnapshotStore} from './server/sync/index.js'

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
}).server((server) => {
  const sync = createSync({store: createMemorySnapshotStore()})
  server.app.get('/sync/:room', sync.handler)
  return {context: {cwd: server.cwd, sync: sync.engine}}
})
