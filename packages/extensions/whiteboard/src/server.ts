import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {deploy} from 'jazz-tools/dev'
import {defineExtension, type ToolRequest} from '@mandarax/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {startJazzRunner} from './server/jazz/runner.js'
import {createBackendDb} from './server/jazz/backend.js'
import {startCommentEnrichment} from './server/jazz/enrich-worker.js'
import {canvasTools} from './tool/canvas/server.js'
import {commentTools} from './tool/comment/server.js'
import {anchorTools} from './tool/anchor/server.js'
import {elementTools} from './tool/element/server.js'

const schemaDir = fileURLToPath(new URL('./shared', import.meta.url))

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [...canvasTools, ...commentTools, ...anchorTools, ...elementTools],
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
  const stopEnrichment = startCommentEnrichment(backend.db, server.cwd)
  const sessionId = (request: ToolRequest): string => {
    if (!request.sessionId) throw new Error('whiteboard tools require an active session')
    return request.sessionId
  }
  return {
    context: {
      cwd: server.cwd,
      db: backend.db,
      sessionId,
      room: sessionId,
      model: (request) => request.model,
    },
    dispose: async () => {
      stopEnrichment()
      await backend.shutdown()
      await runner.stop()
    },
  }
})
