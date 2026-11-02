import {randomUUID} from 'node:crypto'
import {eq} from 'drizzle-orm'
import {z} from 'zod'
import {
  OkSchema,
  SessionIdInputSchema,
  SessionsListInputSchema,
  SessionsListOutputSchema,
  SessionsModelInputSchema,
  SessionsModelOutputSchema,
  SessionsRenameInputSchema,
  SessionsRenameOutputSchema,
  SessionsResolveInputSchema,
  sessionsModelErrors,
  sessionsRenameErrors,
  type SessionMeta,
} from '@conciv/contract'
import {concivError, defineConcivFunction} from '@conciv/extension/devframe-function'
import {NativeSessionRefSchema, SessionId, type NativeSessionRef} from '@conciv/protocol/chat-types'
import {resolveHarnessModels} from '@conciv/harness'
import {clearPageChanges, deleteSessionCaptures, drafts, markers, modelOf, sessions} from '@conciv/db'
import {
  createRow,
  listSessionMetas,
  openNativeRow,
  resolveRow,
  restoreRow,
  rowById,
  tombstoneRow,
} from '../../sessions/session-rows.js'
import type {ServerFunctionsOf} from '../../devframe-plane.js'
import {os, type ChatContext, type RpcDeps} from './mount.js'

export type SessionsDeps = Pick<RpcDeps, 'chat' | 'runtime' | 'publish'>

type SessionIdInput = z.infer<typeof SessionIdInputSchema>

const CodedErrorSchema = z.object({code: z.string()})

export async function rpcSessionList(chat: ChatContext, includeHidden: boolean): Promise<SessionMeta[]> {
  const history = chat.harness.history
  const nativeList =
    chat.harness.capabilities.transcriptHistory && history ? await history.list(chat.cwd, chat.claudeHome) : []
  return listSessionMetas({
    db: chat.db,
    harnessKind: chat.harness.id,
    cwd: chat.cwd,
    nativeList,
    running: await chat.plane.running(),
    model: (sessionId) => modelOf(chat.db, sessionId),
    includeHidden,
  })
}

function cleanTitle(title: string): string {
  return title
    .replace(/\p{Cc}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120)
}

export function harnessMetaOf(deps: Pick<RpcDeps, 'chat'>) {
  return {
    id: deps.chat.harness.id,
    name: deps.chat.harness.displayName ?? deps.chat.harness.id,
    canLaunch: Boolean(deps.chat.harness.connect),
    imageInput: deps.chat.harness.capabilities.imageInput,
  }
}

function sessionsActions(deps: SessionsDeps) {
  const chat = deps.chat
  const db = chat.db
  const scope = {db, harnessKind: chat.harness.id, cwd: chat.cwd}
  const published = async <Result>(result: Result): Promise<Result> => {
    await deps.publish('sessions')
    return result
  }
  return {
    list: (input: z.infer<typeof SessionsListInputSchema>) => rpcSessionList(chat, input.includeHidden ?? false),
    create: async () => {
      const sessionId = SessionId.parse(`conciv_${randomUUID()}`)
      await createRow(db, {
        id: sessionId,
        harnessSessionId: null,
        harnessKind: scope.harnessKind,
        origin: 'chat',
        title: null,
        model: null,
        usage: null,
        cwd: scope.cwd,
        deletedAt: null,
      })
      await db.insert(markers).values({id: randomUUID(), sessionId, afterTurn: 0, kind: 'new'})
      return published({sessionId})
    },
    resolve: async (input: z.infer<typeof SessionsResolveInputSchema>) => published(await resolveRow(scope, input)),
    open: async (input: NativeSessionRef) => published(await openNativeRow(scope, input)),
    restore: async (input: SessionIdInput) => {
      await restoreRow(db, input.sessionId)
      return published({sessionId: input.sessionId})
    },
    rename: async (input: z.infer<typeof SessionsRenameInputSchema>) => {
      if (!(await rowById(db, input.sessionId))) throw concivError('NOT_FOUND', sessionsRenameErrors.NOT_FOUND.message)
      const title = cleanTitle(input.title)
      await db.update(sessions).set({title, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      return published({title})
    },
    delete: async (input: SessionIdInput) => {
      await tombstoneRow(db, input.sessionId)
      await db.delete(drafts).where(eq(drafts.sessionId, input.sessionId))
      await chat.plane.clear(input.sessionId)
      await deleteSessionCaptures(db, input.sessionId)
      await clearPageChanges(db, input.sessionId)
      return published({ok: true as const})
    },
    model: async (input: z.infer<typeof SessionsModelInputSchema>) => {
      if (!(await rowById(db, input.sessionId))) throw concivError('NOT_FOUND', sessionsModelErrors.NOT_FOUND.message)
      const models = await resolveHarnessModels(chat.harness)
      const found = models.find((model) => model.id === input.model && !model.disabled)
      if (!found) throw concivError('UNKNOWN_MODEL', sessionsModelErrors.UNKNOWN_MODEL.message)
      await db.update(sessions).set({model: input.model, updatedAt: Date.now()}).where(eq(sessions.id, input.sessionId))
      return published({model: input.model})
    },
    compact: async (input: SessionIdInput) => {
      await deps.runtime.forSession(input.sessionId).run.compact()
      return published({ok: true as const})
    },
  }
}

function definedErrors<Result>(run: Promise<Result>, errors: Readonly<Record<string, () => Error>>): Promise<Result> {
  return run.catch((error: unknown) => {
    const coded = CodedErrorSchema.safeParse(error)
    const defined = coded.success ? errors[coded.data.code] : undefined
    throw defined ? defined() : error
  })
}

export function sessionsRouter(deps: SessionsDeps) {
  const actions = sessionsActions(deps)
  return {
    list: os.sessions.list.handler(({input}) => actions.list(input ?? {})),
    create: os.sessions.create.handler(() => actions.create()),
    resolve: os.sessions.resolve.handler(({input}) => actions.resolve(input)),
    open: os.sessions.open.handler(({input}) => actions.open(input)),
    restore: os.sessions.restore.handler(({input}) => actions.restore(input)),
    rename: os.sessions.rename.handler(({input, errors}) => definedErrors(actions.rename(input), errors)),
    delete: os.sessions.delete.handler(({input}) => actions.delete(input)),
    model: os.sessions.model.handler(({input, errors}) => definedErrors(actions.model(input), errors)),
    compact: os.sessions.compact.handler(({input}) => actions.compact(input)),
  }
}

export function sessionsFunctions(deps: SessionsDeps) {
  const actions = sessionsActions(deps)
  return [
    defineConcivFunction({
      name: 'conciv:sessions:list',
      type: 'query',
      input: SessionsListInputSchema,
      output: SessionsListOutputSchema,
      handler: actions.list,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:create',
      type: 'action',
      input: z.object({}),
      output: SessionIdInputSchema,
      handler: actions.create,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:resolve',
      type: 'action',
      input: SessionsResolveInputSchema,
      output: SessionIdInputSchema,
      handler: actions.resolve,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:open',
      type: 'action',
      input: NativeSessionRefSchema,
      output: SessionIdInputSchema,
      handler: actions.open,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:restore',
      type: 'action',
      input: SessionIdInputSchema,
      output: SessionIdInputSchema,
      handler: actions.restore,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:rename',
      type: 'action',
      input: SessionsRenameInputSchema,
      output: SessionsRenameOutputSchema,
      handler: actions.rename,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:delete',
      type: 'action',
      input: SessionIdInputSchema,
      output: OkSchema,
      handler: actions.delete,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:model',
      type: 'action',
      input: SessionsModelInputSchema,
      output: SessionsModelOutputSchema,
      handler: actions.model,
    }),
    defineConcivFunction({
      name: 'conciv:sessions:compact',
      type: 'action',
      input: SessionIdInputSchema,
      output: OkSchema,
      handler: actions.compact,
    }),
  ]
}

export type SessionsServerFunctions = ServerFunctionsOf<ReturnType<typeof sessionsFunctions>>
