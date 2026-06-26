import {join} from 'node:path'
import {defineExtension, type ToolRequest} from '@mandarax/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {roomId} from './shared/room.js'
import {startJazzRunner} from './server/jazz/runner.js'
import {createBackendDb} from './server/jazz/backend.js'

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [],
  systemPrompt: WHITEBOARD_PROMPT,
}).server(async (server) => {
  const runner = await startJazzRunner({dataDir: join(server.cwd, '.mandarax', 'whiteboard-jazz')})
  const backend = createBackendDb({
    appId: runner.appId,
    serverUrl: runner.serverUrl,
    backendSecret: runner.backendSecret,
  })
  server.app.get('/config', () => ({serverUrl: runner.serverUrl, appId: runner.appId}))
  return {
    context: {
      cwd: server.cwd,
      db: backend.db,
      room: (request: ToolRequest) => roomId(request.previewId, request.sessionId),
    },
    dispose: async () => {
      await backend.shutdown()
      await runner.stop()
    },
  }
})
