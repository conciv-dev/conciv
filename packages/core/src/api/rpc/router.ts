import {z} from 'zod'
import {asc, eq, lt} from 'drizzle-orm'
import {isPageFailure, type PageErrorCode} from '@conciv/protocol/page-types'
import {resolveHarnessModels} from '@conciv/harness'
import {BundlerConfigSchema, ModuleNodeSchema} from '@conciv/protocol/bundler-types'
import {drafts, markers, navigation} from '@conciv/db'
import type {PageRunErrorName} from '@conciv/contract'
import {listCommands} from '../../chat/commands.js'
import {pageQueryStream, runVerb} from '../../page-bus.js'
import {symbolicateFrames} from '../../editor/symbolicate.js'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {os, type RpcDeps} from './mount.js'

const MAX_NAVIGATION_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_VERB',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, PageRunErrorName>

type MappedPageErrorName = (typeof PAGE_ERROR_NAME)[PageErrorCode]
type UnmappedPageErrorName = Exclude<PageRunErrorName, MappedPageErrorName>
type PageErrors = Record<PageRunErrorName, (options: {message: string}) => Error> & Record<UnmappedPageErrorName, never>
type BundlerErrors = {NO_BUNDLER: () => Error}

function pageError(error: unknown, errors: PageErrors): Error {
  if (!isPageFailure(error)) return error instanceof Error ? error : new Error(String(error))
  return errors[PAGE_ERROR_NAME[error.error.code]]({message: error.error.message})
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

async function callTool<T>(
  deps: RpcDeps,
  name: string,
  input: unknown,
  output: {parse: (value: unknown) => T},
  errors: BundlerErrors,
): Promise<T> {
  try {
    return output.parse(await deps.registry.call(name, input))
  } catch (error) {
    if (hasErrorCode(error, 'NO_BUNDLER')) throw errors.NO_BUNDLER()
    throw error
  }
}

const OkSchema = z.object({ok: z.literal(true)})
const ResolvedIdSchema = z.object({id: z.string().nullable()})
const TransformedSchema = z.object({code: z.string().nullable()})
const ServerUrlsSchema = z.object({local: z.array(z.string()), network: z.array(z.string())})
const ModuleGraphSchema = z.array(ModuleNodeSchema)

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
        return row ? {entries: row.entries, index: row.index, updatedAt: row.updatedAt} : null
      }),
      set: os.navigation.set.handler(async ({input}) => {
        if (input.updatedAt > Date.now() + MAX_NAVIGATION_CLOCK_SKEW_MS) return {ok: true as const, applied: false}
        const row = {id: 'navigation', entries: input.entries, index: input.index, updatedAt: input.updatedAt}
        const result = await db
          .insert(navigation)
          .values(row)
          .onConflictDoUpdate({
            target: navigation.id,
            set: row,
            setWhere: lt(navigation.updatedAt, input.updatedAt),
          })
        return {ok: true as const, applied: Number(result.changes) > 0}
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
      symbolicate: os.page.symbolicate.handler(({input}) => symbolicateFrames(input.frames, deps.page.root)),
      changes: os.page.changes.handler(() => deps.page.journal.list()),
      clearChanges: os.page.clearChanges.handler(() => {
        deps.page.journal.clear()
        return {ok: true as const}
      }),
      queries: os.page.queries.handler(async function* ({signal}) {
        yield* pageQueryStream(deps.page.bus, signal ?? new AbortController().signal)
      }),
      reply: os.page.reply.handler(({input, errors}) => {
        if (!deps.page.bus.resolve(input.requestId, input.outcome)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    server: {
      config: os.server.config.handler(({errors}) => callTool(deps, 'server.config', {}, BundlerConfigSchema, errors)),
      resolve: os.server.resolve.handler(({input, errors}) =>
        callTool(deps, 'server.resolve', input, ResolvedIdSchema, errors),
      ),
      graph: os.server.graph.handler(({input, errors}) =>
        callTool(deps, 'server.graph', input, ModuleGraphSchema, errors),
      ),
      transform: os.server.transform.handler(({input, errors}) =>
        callTool(deps, 'server.transform', input, TransformedSchema, errors),
      ),
      urls: os.server.urls.handler(({errors}) => callTool(deps, 'server.urls', {}, ServerUrlsSchema, errors)),
      reload: os.server.reload.handler(({input, errors}) => callTool(deps, 'server.reload', input, OkSchema, errors)),
      restart: os.server.restart.handler(({input, errors}) =>
        callTool(deps, 'server.restart', input, OkSchema, errors),
      ),
    },
    editor: {
      open: os.editor.open.handler(async ({input}) => {
        await deps.registry.call('open', input)
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
        listCommands(chat, {sessionId: input.sessionId, requestUrl: context.request.url}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
    },
  })
}
