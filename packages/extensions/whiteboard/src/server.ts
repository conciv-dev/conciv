import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {deploy} from 'jazz-tools/dev'
import {defineExtension, type ToolRequest} from '@mandarax/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {roomId} from './shared/room.js'
import {startJazzRunner} from './server/jazz/runner.js'
import {createBackendDb} from './server/jazz/backend.js'
import {canvasTools} from './tool/canvas/server.js'

const schemaDir = fileURLToPath(new URL('./shared', import.meta.url))

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: canvasTools,
  systemPrompt: WHITEBOARD_PROMPT,
}).server(async (server) => {
  const runner = await startJazzRunner({dataDir: join(server.cwd, '.mandarax', 'whiteboard-jazz')})
  await deploy({serverUrl: runner.serverUrl, appId: runner.appId, adminSecret: runner.adminSecret, schemaDir})
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
