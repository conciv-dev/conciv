import type {ManagedRuntime} from 'effect'
import {Effect, Layer} from 'effect'
import {clamp} from 'es-toolkit'
import {resolveHarnessModels, type HarnessAdapter} from '@conciv/harness'
import {
  HarnessListCursorSchema,
  ReasoningEffortSchema,
  SessionRecordSchema,
  type ReasoningEffort,
  type SessionId,
  type SessionRecord,
} from '@conciv/protocol/chat-types'
import {Agent, type Bus, type KV, Session, SessionErrors} from '@conciv/plugin-host'
import type {ChatContext} from '../api/rpc/mount.js'
import {listedSessionPage, searchedSessionPage, switchSessionEffort, switchSessionModel} from '../api/rpc/sessions.js'
import {
  createChatSession,
  deleteSession,
  newSessionId,
  renameSession,
  reuseDeletedChatSession,
} from '../sessions/session-actions.js'
import type {createSessionSearch} from '../sessions/session-search.js'
import {rowById, setMetadata, setPermissions} from '../sessions/session-rows.js'
import type {CoreRuntime} from './scope-types.js'
import type {PageQueues} from '../page/page-queue.js'

type SessionKeyDeps = {
  chat: ChatContext
  runtime: Pick<CoreRuntime, 'forSession'>
  search: Pick<ReturnType<typeof createSessionSearch>, 'retitle' | 'pages' | 'listed'>
  pluginHost: ManagedRuntime.ManagedRuntime<Bus.Interface | KV.Interface, never>
  queues: Pick<PageQueues, 'release'>
}

type SessionInfo = Effect.Success<ReturnType<Session.Interface['get']>>
type ModelRef = Parameters<Session.Interface['switchModel']>[0]['model']
type CreateInput = Parameters<Session.Interface['create']>[0]
type ModelChoice = {model: string; effort: ReasoningEffort | null}
type Compaction = Effect.Success<ReturnType<Session.Interface['compact']>>

const DEFAULT_PAGE_SIZE = 30
const MAX_PAGE_SIZE = 100

const given = <Value>(value: Value | null | undefined): Value | undefined => value ?? undefined

const NO_USAGE = {
  totalCostUsd: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
}

function sessionModel(chat: ChatContext, row: SessionRecord): ModelRef | undefined {
  if (row.model === null) return undefined
  return {id: row.model, providerId: chat.harnessFor(row.id).id, variant: row.effort ?? undefined}
}

function sessionInfo(chat: ChatContext, row: SessionRecord): SessionInfo {
  const usage = {...NO_USAGE, ...row.usage}
  return {
    id: row.id,
    projectId: undefined,
    agent: Agent.defaultId,
    model: sessionModel(chat, row),
    cost: usage.totalCostUsd,
    tokens: {
      input: usage.inputTokens,
      output: usage.outputTokens,
      reasoning: usage.reasoningTokens,
      cache: {read: usage.cacheReadTokens, write: usage.cacheWriteTokens},
    },
    time: {created: row.createdAt, updated: row.updatedAt},
    title: row.title ?? undefined,
    metadata: row.metadata ?? undefined,
    permissions: row.permissions ?? undefined,
    location: {directory: row.cwd},
  }
}

function modelChoice(harness: HarnessAdapter, ref: ModelRef) {
  return Effect.promise(() => resolveHarnessModels(harness)).pipe(
    Effect.map((models): ModelChoice | null => {
      if (ref.providerId !== harness.id) return null
      const listed = models.find((candidate) => candidate.id === ref.id && candidate.disabled !== true)
      if (listed === undefined) return null
      if (ref.variant === undefined) return {model: listed.id, effort: null}
      const effort = ReasoningEffortSchema.safeParse(ref.variant)
      if (!effort.success || listed.efforts?.includes(effort.data) !== true) return null
      return {model: listed.id, effort: effort.data}
    }),
  )
}

function applyModelChoice(chat: ChatContext, sessionId: SessionId, choice: ModelChoice) {
  return Effect.promise(async () => {
    if ((await switchSessionModel(chat, sessionId, choice.model)) !== 'switched') return false
    if (choice.effort === null) return true
    return (await switchSessionEffort(chat, sessionId, choice.effort)) === 'switched'
  })
}

function createdModel(chat: ChatContext, input: CreateInput, sessionId: SessionId) {
  return Effect.gen(function* () {
    const agent = given(input.agent) ?? Agent.defaultId
    if (agent !== Agent.defaultId) {
      return yield* Effect.fail(SessionErrors.makeAgentNotFoundError({sessionId, agent: Agent.Id.make(agent)}))
    }
    const model = given(input.model)
    if (model === undefined) return null
    const choice = yield* modelChoice(chat.defaultHarness, model)
    if (choice === null) return yield* Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
    return choice
  })
}

async function describeCreated(
  renaming: Parameters<typeof renameSession>[0],
  sessionId: SessionId,
  input: CreateInput,
): Promise<void> {
  const title = given(input.title)
  const metadata = given(input.metadata)
  const permissions = given(input.permissions)
  if (title !== undefined) await renameSession(renaming, sessionId, title)
  if (metadata !== undefined) await setMetadata(renaming.db, sessionId, metadataSchema.parse(metadata))
  if (permissions !== undefined) await setPermissions(renaming.db, sessionId, permissionsSchema.parse(permissions))
}

const readCursor = (cursor: string) =>
  Effect.try({
    try: () => HarnessListCursorSchema.parse(JSON.parse(cursor)),
    catch: () => SessionErrors.makeInvalidListCursorError(),
  })

const metadataSchema = SessionRecordSchema.shape.metadata.unwrap().unwrap()
const permissionsSchema = SessionRecordSchema.shape.permissions.unwrap().unwrap()

export function provideSessions(started: () => SessionKeyDeps) {
  const found = (sessionId: SessionId) =>
    Effect.promise(() => rowById(started().chat.db, sessionId)).pipe(
      Effect.flatMap((row) =>
        row === null || row.deletedAt !== null
          ? Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
          : Effect.succeed(row),
      ),
    )
  const get = (sessionId: SessionId) => found(sessionId).pipe(Effect.map((row) => sessionInfo(started().chat, row)))
  return Layer.succeed(
    Session.Service,
    Session.Service.of({
      get,
      list: (input) =>
        Effect.gen(function* () {
          const {chat, search} = started()
          const cursor = input?.cursor === undefined ? null : yield* readCursor(input.cursor)
          const limit = clamp(Math.trunc(input?.limit ?? DEFAULT_PAGE_SIZE), 1, MAX_PAGE_SIZE)
          const term = input?.search?.trim() ?? ''
          const page = yield* Effect.promise(() =>
            term === ''
              ? listedSessionPage(chat, search, {cursor, limit})
              : searchedSessionPage(chat, search, {cursor, limit, term, everywhere: false}),
          )
          const rows = yield* Effect.promise(() => Promise.all(page.sessions.map((hit) => rowById(chat.db, hit.id))))
          return {
            data: rows.filter((row) => row !== null).map((row) => sessionInfo(chat, row)),
            cursor: page.next === null ? {} : {next: JSON.stringify(page.next)},
          }
        }),
      create: (input) =>
        Effect.gen(function* () {
          const {chat, search} = started()
          const supplied = input.id
          const recorded = supplied === undefined ? null : yield* Effect.promise(() => rowById(chat.db, supplied))
          if (recorded !== null && recorded.deletedAt === null) return sessionInfo(chat, recorded)
          const sessionId = supplied ?? newSessionId()
          const choice = yield* createdModel(chat, input, sessionId)
          const scope = {harnessKind: chat.defaultHarness.id, cwd: chat.cwd}
          yield* Effect.promise(() =>
            recorded === null
              ? createChatSession(chat.db, scope, sessionId)
              : reuseDeletedChatSession(chat.db, scope, sessionId),
          )
          yield* Effect.promise(() => describeCreated({db: chat.db, search}, sessionId, input))
          if (choice !== null && !(yield* applyModelChoice(chat, sessionId, choice))) {
            return yield* Effect.fail(SessionErrors.makeNotFoundError({sessionId}))
          }
          return yield* get(sessionId)
        }),
      remove: (sessionId) =>
        found(sessionId).pipe(
          Effect.andThen(() => {
            const {chat, pluginHost, queues} = started()
            return Effect.promise(() => deleteSession({db: chat.db, plane: chat.plane, pluginHost, queues}, sessionId))
          }),
        ),
      switchAgent: (input) =>
        found(input.sessionId).pipe(
          Effect.andThen(() =>
            input.agent === Agent.defaultId
              ? Effect.void
              : Effect.fail(
                  SessionErrors.makeAgentNotFoundError({sessionId: input.sessionId, agent: Agent.Id.make(input.agent)}),
                ),
          ),
        ),
      switchModel: (input) =>
        Effect.gen(function* () {
          const {chat} = started()
          yield* found(input.sessionId)
          const choice = yield* modelChoice(chat.harnessFor(input.sessionId), input.model)
          if (choice === null || !(yield* applyModelChoice(chat, input.sessionId, choice))) {
            return yield* Effect.fail(SessionErrors.makeNotFoundError({sessionId: input.sessionId}))
          }
        }),
      rename: (input) =>
        found(input.sessionId).pipe(
          Effect.andThen(() => {
            const {chat, search} = started()
            return Effect.promise(() => renameSession({db: chat.db, search}, input.sessionId, input.title))
          }),
          Effect.flatMap((outcome) =>
            outcome === 'missing'
              ? Effect.fail(SessionErrors.makeNotFoundError({sessionId: input.sessionId}))
              : Effect.void,
          ),
        ),
      setMetadata: (input) =>
        found(input.sessionId).pipe(
          Effect.andThen(() =>
            Effect.promise(() => setMetadata(started().chat.db, input.sessionId, metadataSchema.parse(input.metadata))),
          ),
        ),
      setPermissions: (input) =>
        found(input.sessionId).pipe(
          Effect.andThen(() =>
            Effect.promise(() =>
              setPermissions(started().chat.db, input.sessionId, permissionsSchema.parse(input.permissions)),
            ),
          ),
        ),
      compact: (input) =>
        found(input.sessionId).pipe(
          Effect.andThen(() => {
            const compaction: Compaction = {
              id: undefined,
              sessionId: input.sessionId,
              time: {created: Date.now()},
              type: 'compaction',
              payload: {},
              delivery: undefined,
            }
            return Effect.promise(() => started().runtime.forSession(input.sessionId).run.compact()).pipe(
              Effect.as(compaction),
            )
          }),
        ),
      wait: (sessionId) =>
        found(sessionId).pipe(Effect.andThen(() => Effect.promise(() => started().chat.plane.settled(sessionId)))),
      interrupt: (sessionId) =>
        Effect.promise(() => started().runtime.forSession(sessionId).run.stop()).pipe(
          Effect.map(({stopped}) => stopped),
        ),
    }),
  )
}
