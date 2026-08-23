import {randomUUID} from 'node:crypto'
import {z} from 'zod'
import {asc, eq} from 'drizzle-orm'
import {isPageFailure, type PageErrorCode} from '@conciv/protocol/page-types'
import {isPageVerbError} from '@conciv/extension'
import {resolveHarnessModels} from '@conciv/harness'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOL} from '@conciv/tools/builtins'
import {drafts, markers} from '@conciv/db'
import type {RegistryCallErrorName} from '@conciv/contract'
import {listCommands} from '../../chat/commands.js'
import {makeAskGate, requiresApproval} from '../../chat/gate.js'
import {rowById} from '../../chat/session-rows.js'
import {session} from '../../runtime/session-context.js'
import type {SettingsWriteOutcome} from '../../settings/service.js'
import type {SettingsScope} from '@conciv/protocol/settings-types'
import {chatRouter} from './chat.js'
import {harnessMetaOf, sessionsRouter} from './sessions.js'
import {makeSessionOs, os, type RpcDeps} from './mount.js'

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

const SETTINGS_RPC_ACTOR = 'user'

type SettingsErrors = {
  UNKNOWN_KEY: () => Error
  INVALID_VALUE: () => Error
  REVISION_CONFLICT: (options: {data: {scope: SettingsScope; revision: string}}) => Error
  LAYER_UNPARSEABLE: (options: {message: string}) => Error
  LOCK_TIMEOUT: () => Error
}

function settled(outcome: SettingsWriteOutcome, errors: SettingsErrors): {ok: true; opId: string} {
  if (outcome.ok) return {ok: true, opId: outcome.opId}
  const failure = outcome.failure
  if (failure.kind === 'unknown-key') throw errors.UNKNOWN_KEY()
  if (failure.kind === 'invalid-value') throw errors.INVALID_VALUE()
  if (failure.kind === 'lock-timeout') throw errors.LOCK_TIMEOUT()
  if (failure.kind === 'revision-conflict') {
    throw errors.REVISION_CONFLICT({data: {scope: failure.scope, revision: failure.revision}})
  }
  throw errors.LAYER_UNPARSEABLE({
    message: `the ${failure.scope} settings file does not parse; fix it before writing`,
  })
}

type ApprovalErrors = {APPROVAL_DENIED: (options: {message: string}) => Error}

async function approveAskGatedCall(deps: RpcDeps, name: string, input: unknown, errors: ApprovalErrors): Promise<void> {
  const scope = session()
  if (!requiresApproval(scope.tools.catalog.get(name))) return
  if ((await rowById(deps.chat.db, scope.id)) === null) {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval but session "${scope.id}" does not exist`,
    })
  }
  if (!scope.stream.listening()) {
    throw errors.APPROVAL_DENIED({
      message: `"${name}" requires approval but nothing is attached to session "${scope.id}" to answer; open the widget on that session and retry`,
    })
  }
  const gate = makeAskGate({
    asks: scope.asks,
    emit: (chunk) => scope.stream.publish(chunk),
    ...(deps.askTimeoutMs === undefined ? {} : {timeoutMs: deps.askTimeoutMs}),
  })
  const decision = await gate.decide(name, input, randomUUID())
  if (decision === 'allow') return
  if (decision === 'deny') throw errors.APPROVAL_DENIED({message: `"${name}" was denied by the user`})
  throw errors.APPROVAL_DENIED({
    message: `"${name}" received no approval decision (the ask timed out or the session stopped)`,
  })
}

async function callTool<Output extends z.ZodType>(
  tool: {name: string; outputSchema?: Output},
  input: unknown,
  errors?: BundlerErrors,
): Promise<z.output<Output>> {
  const output = tool.outputSchema
  if (output === undefined) throw new Error(`tool "${tool.name}" declares no output schema`)
  try {
    return output.parse(await session().tools.call(tool.name, input))
  } catch (error) {
    if (errors && hasErrorCode(error, 'NO_BUNDLER')) throw errors.NO_BUNDLER()
    throw error
  }
}

export function makeRpcRouter(deps: RpcDeps) {
  const chat = deps.chat
  const db = chat.db
  const engine = deps.runtime.engine
  const sessionOs = makeSessionOs(deps)
  return os.router({
    sessions: sessionsRouter(deps),
    chat: chatRouter(deps, sessionOs),
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
      get: os.navigation.get.handler(() => engine.navigation.get()),
      set: os.navigation.set.handler(({input}) => engine.navigation.set(input)),
    },
    settings: {
      get: os.settings.get.handler(() => deps.settings.read()),
      set: os.settings.set.handler(async ({input, errors}) =>
        settled(await deps.settings.set({...input, actor: SETTINGS_RPC_ACTOR}), errors),
      ),
      clear: os.settings.clear.handler(async ({input, errors}) =>
        settled(await deps.settings.clear({...input, actor: SETTINGS_RPC_ACTOR}), errors),
      ),
      applyGlobally: os.settings.applyGlobally.handler(async ({input, errors}) =>
        settled(await deps.settings.applyGlobally({...input, actor: SETTINGS_RPC_ACTOR}), errors),
      ),
      reset: os.settings.reset.handler(async ({input, errors}) =>
        settled(await deps.settings.reset({...input, actor: SETTINGS_RPC_ACTOR}), errors),
      ),
      history: os.settings.history.handler(({input}) => deps.settings.history(input.key)),
    },
    registry: {
      catalog: os.registry.catalog.handler(() => engine.catalog()),
      call: sessionOs.registry.call.handler(async ({input, context, errors}) => {
        if (!context.session.tools.has(input.name)) throw errors.UNKNOWN_TOOL()
        await approveAskGatedCall(deps, input.name, input.input, errors)
        try {
          return await context.session.tools.call(input.name, input.input)
        } catch (error) {
          throw registryCallError(error, errors)
        }
      }),
    },
    captures: {
      list: os.captures.list.handler(({input}) => deps.runtime.forSession(input.sessionId).captures.list()),
    },
    page: {
      symbolicate: os.page.symbolicate.handler(({input}) => engine.symbolicate(input.frames)),
      changes: sessionOs.page.changes.handler(({context}) => context.session.page.changes()),
      clearChanges: sessionOs.page.clearChanges.handler(async ({context}) => {
        await context.session.page.clearChanges()
        return {ok: true as const}
      }),
      queries: sessionOs.page.queries.handler(({context, signal}) =>
        context.session.page.queries(signal ?? new AbortController().signal),
      ),
      reply: sessionOs.page.reply.handler(({input, context, errors}) => {
        if (!context.session.page.reply(input.requestId, input.outcome)) throw errors.UNKNOWN_REQUEST()
        return {ok: true as const}
      }),
    },
    server: {
      config: sessionOs.server.config.handler(({errors}) => callTool(BUILTIN_SERVER_TOOL['server.config'], {}, errors)),
      resolve: sessionOs.server.resolve.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL['server.resolve'], input, errors),
      ),
      graph: sessionOs.server.graph.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL['server.graph'], input, errors),
      ),
      transform: sessionOs.server.transform.handler(({input, errors}) =>
        callTool(BUILTIN_SERVER_TOOL['server.transform'], input, errors),
      ),
      urls: sessionOs.server.urls.handler(({errors}) => callTool(BUILTIN_SERVER_TOOL['server.urls'], {}, errors)),
      reload: sessionOs.server.reload.handler(async ({input, errors}) => {
        await approveAskGatedCall(deps, BUILTIN_SERVER_TOOL['server.reload'].name, input, errors)
        return callTool(BUILTIN_SERVER_TOOL['server.reload'], input, errors)
      }),
      restart: sessionOs.server.restart.handler(async ({input, errors}) => {
        await approveAskGatedCall(deps, BUILTIN_SERVER_TOOL['server.restart'].name, input, errors)
        return callTool(BUILTIN_SERVER_TOOL['server.restart'], input, errors)
      }),
    },
    editor: {
      open: sessionOs.editor.open.handler(({input}) => callTool(BUILTIN_OPEN_TOOL, input)),
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
        listCommands(chat, {sessionId: input.sessionId, origin: context.origin}),
      ),
      tools: os.meta.tools.handler(() => ({tools: deps.tools})),
      engine: os.meta.engine.handler(() => engine.staleness()),
    },
  })
}
