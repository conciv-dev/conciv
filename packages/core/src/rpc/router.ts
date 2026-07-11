import {asc, eq} from 'drizzle-orm'
import {HTTPException} from 'hono/http-exception'
import {resolveHarnessModels} from '@conciv/harness'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {drafts, markers, navigation} from '@conciv/db'
import {listCommands} from '../chat/session.js'
import {pageQueryStream, runVerb} from '../page/page.js'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {os, type RpcDeps} from './mount.js'

type PageErrors = {NO_PAGE_CLIENT: () => Error; PAGE_TIMEOUT: () => Error}
type BundlerErrors = {NO_BUNDLER: () => Error}

function pageError(error: unknown, errors: PageErrors): Error {
  if (error instanceof HTTPException && error.status === 503) return errors.NO_PAGE_CLIENT()
  if (error instanceof HTTPException && error.status === 504) return errors.PAGE_TIMEOUT()
  return error instanceof Error ? error : new Error(String(error))
}

function requireBridge(deps: RpcDeps, errors: BundlerErrors): BundlerBridge {
  const bridge = deps.bundler()
  if (!bridge) throw errors.NO_BUNDLER()
  return bridge
}

export function makeRpcRouter(deps: RpcDeps) {
  const chat = deps.chat
  const db = chat.db
  return os.router({
    sessions: sessionsRouter(deps),
    chat: chatRouter(deps),
    drafts: {
      get: os.drafts.get.handler(async ({input}) => {
        const rows = await db.select().from(drafts).where(eq(drafts.sessionId, input.sessionId))
        return rows[0] ?? null
      }),
      set: os.drafts.set.handler(async ({input}) => {
        const row = {...input, updatedAt: Date.now()}
        await db.insert(drafts).values(row).onConflictDoUpdate({target: drafts.sessionId, set: row})
        return {ok: true as const}
      }),
    },
    markers: {
      list: os.markers.list.handler(({input}) =>
        db.select().from(markers).where(eq(markers.sessionId, input.sessionId)).orderBy(asc(markers.afterTurn)),
      ),
    },
    navigation: {
      get: os.navigation.get.handler(async () => {
        const rows = await db.select().from(navigation).where(eq(navigation.id, 'navigation'))
        const row = rows[0]
        return row ? {entries: row.entries, index: row.index} : null
      }),
      set: os.navigation.set.handler(async ({input}) => {
        const row = {id: 'navigation', entries: input.entries, index: input.index, updatedAt: Date.now()}
        await db.insert(navigation).values(row).onConflictDoUpdate({target: navigation.id, set: row})
        return {ok: true as const}
      }),
    },
    page: {
      run: os.page.run.handler(async ({input, errors}) => {
        const {verb, ...query} = input
        try {
          return await runVerb(deps.page, query, verb)
        } catch (error) {
          throw pageError(error, errors)
        }
      }),
      changes: os.page.changes.handler(() => deps.page.journal.list()),
      clearChanges: os.page.clearChanges.handler(() => {
        deps.page.journal.clear()
        return {ok: true as const}
      }),
      queries: os.page.queries.handler(async function* ({signal}) {
        yield* pageQueryStream(deps.page.bus, signal ?? new AbortController().signal)
      }),
      reply: os.page.reply.handler(({input, errors}) => {
        if (!deps.page.bus.resolve(input.requestId, input.data)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    server: {
      config: os.server.config.handler(({errors}) => requireBridge(deps, errors).config()),
      resolve: os.server.resolve.handler(({input, errors}) =>
        requireBridge(deps, errors).resolve(input.spec, input.importer),
      ),
      graph: os.server.graph.handler(({input, errors}) => requireBridge(deps, errors).moduleGraph(input.file)),
      transform: os.server.transform.handler(({input, errors}) => requireBridge(deps, errors).transform(input.url)),
      urls: os.server.urls.handler(({errors}) => requireBridge(deps, errors).urls()),
      reload: os.server.reload.handler(async ({input, errors}) => {
        await requireBridge(deps, errors).reload(input.file)
        return {ok: true as const}
      }),
      restart: os.server.restart.handler(async ({input, errors}) => {
        await requireBridge(deps, errors).restart(input.force)
        return {ok: true as const}
      }),
    },
    editor: {
      open: os.editor.open.handler(({input}) => {
        deps.openInEditor(input.file, input.line)
        return {ok: true as const}
      }),
      openFromFrames: os.editor.openFromFrames.handler(({input}) => deps.openFromFrames(input.frames)),
    },
    meta: {
      models: os.meta.models.handler(async () => {
        const models = await resolveHarnessModels(chat.harness)
        return {
          models,
          defaultModel: chat.harness.defaultModel ?? models[0]?.id ?? null,
          harness: harnessMetaOf(deps),
        }
      }),
      commands: os.meta.commands.handler(({input, context}) =>
        listCommands(chat, {sessionId: input.sessionId, origin: new URL(context.request.url).origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
    },
  })
}
