import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {asc, eq, lt} from 'drizzle-orm'
import {isPageFailure, type PageErrorCode} from '@conciv/protocol/page-types'
import {CONCIV_SESSION_HEADER, isSessionId} from '@conciv/protocol/chat-types'
import {isPageVerbError} from '@conciv/extension'
import {resolveHarnessModels} from '@conciv/harness'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOL} from '@conciv/tools/builtins'
import {drafts, markers, navigation} from '@conciv/db'
import type {RegistryCallErrorName, ToolCommandSignature} from '@conciv/contract'
import {listCommands} from '../../chat/commands.js'
import {makeAskGate, requiresApproval} from '../../chat/gate.js'
import {rowById} from '../../chat/session-rows.js'
import {pageQueryStream} from '../../page-bus.js'
import {symbolicateFrames} from '../../editor/symbolicate.js'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {os, type RpcDeps} from './mount.js'

const MAX_NAVIGATION_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

export const PAGE_ERROR_NAME = {
  'no-widget': 'NO_PAGE_CLIENT',
  timeout: 'PAGE_TIMEOUT',
  'unknown-verb': 'UNKNOWN_TOOL',
  'invalid-args': 'INVALID_ARGS',
  'handler-error': 'HANDLER_ERROR',
} as const satisfies Record<PageErrorCode, RegistryCallErrorName>

type RegistryErrors = Record<RegistryCallErrorName, (options: {message: string}) => Error>
type BundlerErrors = {NO_BUNDLER: () => Error}

function registryCallError(error: unknown, errors: RegistryErrors): Error {
  if (isPageVerbError(error)) return errors[PAGE_ERROR_NAME[error.code]]({message: error.message})
  if (isPageFailure(error)) return errors[PAGE_ERROR_NAME[error.error.code]]({message: error.error.message})
  return error instanceof Error ? error : new Error(String(error))
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

type ApprovalErrors = {APPROVAL_DENIED: (options: {message: string}) => Error}

function callerSessionId(name: string, request: Request, errors: ApprovalErrors): string {
  const raw = request.headers.get(CONCIV_SESSION_HEADER)?.trim() ?? ''
  if (raw === '') {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval and no session is attached to ask through; run from a conciv-launched terminal or send ${CONCIV_SESSION_HEADER} (CONCIV_SESSION_ID for the CLI)`,
    })
  }
  if (!isSessionId(raw)) {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval but the ${CONCIV_SESSION_HEADER} header carries a malformed session id`,
    })
  }
  return raw
}

async function approveAskGatedCall(
  deps: RpcDeps,
  name: string,
  input: unknown,
  request: Request,
  errors: ApprovalErrors,
): Promise<void> {
  if (!requiresApproval(deps.registry.catalog.get(name))) return
  const sessionId = callerSessionId(name, request, errors)
  if ((await rowById(deps.chat.db, sessionId)) === null) {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval but session "${sessionId}" does not exist`,
    })
  }
  if (!deps.chat.stream.listening(sessionId)) {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval but nothing is attached to session "${sessionId}" to answer; open the widget on that session and retry`,
    })
  }
  const gate = makeAskGate({
    sessionId,
    asks: deps.chat.asks,
    emit: (chunk) => deps.chat.stream.publish(sessionId, chunk),
    ...(deps.askTimeoutMs === undefined ? {} : {timeoutMs: deps.askTimeoutMs}),
  })
  const decision = await gate.decide(name, input, sessionId, randomUUID())
  if (decision === 'allow') return
  if (decision === 'deny') throw errors.APPROVAL_DENIED({message: `"${name}" was denied by the user`})
  throw errors.APPROVAL_DENIED({
    message: `"${name}" received no approval decision (the ask timed out or the session stopped)`,
  })
}

async function callTool<Output extends z.ZodType>(
  deps: RpcDeps,
  tool: {name: string; outputSchema?: Output},
  input: unknown,
  errors?: BundlerErrors,
): Promise<z.output<Output>> {
  const output = tool.outputSchema
  if (output === undefined) throw new Error(`tool "${tool.name}" declares no output schema`)
  try {
    return output.parse(await deps.registry.call(tool.name, input))
  } catch (error) {
    if (errors && hasErrorCode(error, 'NO_BUNDLER')) throw errors.NO_BUNDLER()
    throw error
  }
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
    registry: {
      catalog: os.registry.catalog.handler((): ToolCommandSignature[] =>
        deps.registry.catalog.list().map((entry) => {
          const signature = deps.registry.catalog.get(entry.name)
          return {
            name: entry.name,
            path: [...entry.path],
            binding: entry.binding,
            summary: entry.summary,
            category: entry.category,
            hint: entry.hint,
            positional: signature.positional,
            mutating: signature.mutating,
            reachable: entry.reachable,
            input: signature.input,
          }
        }),
      ),
      call: os.registry.call.handler(async ({input, context, errors}) => {
        if (!deps.registry.has(input.name)) throw errors.UNKNOWN_TOOL()
        await approveAskGatedCall(deps, input.name, input.input, context.request, errors)
        try {
          return await deps.registry.call(input.name, input.input)
        } catch (error) {
          throw registryCallError(error, errors)
        }
      }),
    },
    page: {
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
      config: os.server.config.handler(({errors}) => callTool(deps, BUILTIN_SERVER_TOOL['server.config'], {}, errors)),
      resolve: os.server.resolve.handler(({input, errors}) =>
        callTool(deps, BUILTIN_SERVER_TOOL['server.resolve'], input, errors),
      ),
      graph: os.server.graph.handler(({input, errors}) =>
        callTool(deps, BUILTIN_SERVER_TOOL['server.graph'], input, errors),
      ),
      transform: os.server.transform.handler(({input, errors}) =>
        callTool(deps, BUILTIN_SERVER_TOOL['server.transform'], input, errors),
      ),
      urls: os.server.urls.handler(({errors}) => callTool(deps, BUILTIN_SERVER_TOOL['server.urls'], {}, errors)),
      reload: os.server.reload.handler(async ({input, context, errors}) => {
        await approveAskGatedCall(deps, BUILTIN_SERVER_TOOL['server.reload'].name, input, context.request, errors)
        return callTool(deps, BUILTIN_SERVER_TOOL['server.reload'], input, errors)
      }),
      restart: os.server.restart.handler(async ({input, context, errors}) => {
        await approveAskGatedCall(deps, BUILTIN_SERVER_TOOL['server.restart'].name, input, context.request, errors)
        return callTool(deps, BUILTIN_SERVER_TOOL['server.restart'], input, errors)
      }),
    },
    editor: {
      open: os.editor.open.handler(({input}) => callTool(deps, BUILTIN_OPEN_TOOL, input)),
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
