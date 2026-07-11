import {join} from 'node:path'
import {defineExtension, type ToolRequest} from '@conciv/extension'
import {WHITEBOARD_NAME, WHITEBOARD_PROMPT} from './shared/meta.js'
import {createStore} from './server/db/store.js'
import {makeWhiteboardRouter} from './server/router.js'
import {startCommentEnrichment} from './server/enrich-worker.js'
import {autoCommitDraft} from './server/auto-commit.js'
import {canvasTools} from './tool/canvas/server.js'
import {commentTools} from './tool/comment/server.js'
import {anchorTools} from './tool/anchor/server.js'
import {elementTools} from './tool/element/server.js'

export default defineExtension({
  name: WHITEBOARD_NAME,
  tools: [...canvasTools, ...commentTools, ...anchorTools, ...elementTools],
  systemPrompt: WHITEBOARD_PROMPT,
}).server(async (server) => {
  const store = await createStore(join(server.cwd, '.conciv', 'whiteboard'))
  const stopEnrichment = startCommentEnrichment(store, server.cwd)
  const sessionId = (request: ToolRequest): string => {
    if (!request.sessionId) throw new Error('whiteboard tools require an active session')
    return request.sessionId
  }
  return {
    context: {cwd: server.cwd, store, sessionId, room: sessionId, model: (request) => request.model},
    router: makeWhiteboardRouter(store),
    turnEnd: (turnSessionId) =>
      void autoCommitDraft(store, turnSessionId).catch((error) =>
        console.error(`[whiteboard] auto-commit on turn end failed for ${turnSessionId}: ${String(error)}`),
      ),
    dispose: async () => {
      stopEnrichment()
      store.close()
    },
  }
})
