import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {Hono} from 'hono'
import {deploy} from 'jazz-tools/dev'
import {defineExtension, type ToolRequest} from '@conciv/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {startJazzRunner} from './server/jazz/runner.js'
import {createBackendDb} from './server/jazz/backend.js'
import {startCommentEnrichment} from './server/jazz/enrich-worker.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {canvasTools} from './tool/canvas/server.js'
import {commentTools} from './tool/comment/server.js'
import {anchorTools} from './tool/anchor/server.js'
import {elementTools} from './tool/element/server.js'

const schemaDir = fileURLToPath(new URL('./shared', import.meta.url))

type WhiteboardEnv = {Variables: {whiteboard: {serverUrl: string; appId: string}}}

const app = new Hono<WhiteboardEnv>().get('/config', (c) => c.json(c.var.whiteboard))

export type WhiteboardAppType = typeof app

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [...canvasTools, ...commentTools, ...anchorTools, ...elementTools],
  systemPrompt: WHITEBOARD_PROMPT,
}).server(async (server) => {
  const runner = await startJazzRunner({dataDir: join(server.cwd, '.conciv', 'whiteboard-jazz')})
  await deploy({serverUrl: runner.serverUrl, appId: runner.appId, adminSecret: runner.adminSecret, schemaDir})
  const backend = createBackendDb({
    appId: runner.appId,
    serverUrl: runner.serverUrl,
    backendSecret: runner.backendSecret,
  })
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
    app: new Hono<WhiteboardEnv>()
      .use(async (c, next) => {
        c.set('whiteboard', {serverUrl: runner.serverUrl, appId: runner.appId})
        await next()
      })
      .route('/', app),
    turnEnd: (turnSessionId) =>
      void autoCommitDraft(backend.db, turnSessionId).catch((error) =>
        console.error(`[whiteboard] auto-commit on turn end failed for ${turnSessionId}: ${String(error)}`),
      ),
    dispose: async () => {
      stopEnrichment()
      await backend.shutdown()
      await runner.stop()
    },
  }
})
