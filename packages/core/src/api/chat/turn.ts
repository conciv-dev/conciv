import {type H3, HTTPError, readValidatedBody} from 'h3'
import {chat, EventType, toServerSentEventsStream, type StreamChunk} from '@tanstack/ai'
import {harnessText} from '@conciv/harness'
import type {HarnessAdapter, HarnessChild} from '@conciv/protocol/harness-types'
import {UiSpecSchema} from '@conciv/protocol/ui-types'
import {ChatRequestSchema} from '@conciv/protocol/chat-types'
import {tokenUsageToSnapshot} from '@conciv/protocol/usage-types'
import {acquireLock, releaseLock, updateLockPid} from '../../store/lock.js'
import type {SessionStore} from '../../store/session-store.js'
import type {UiBus} from '../../runtime/ui-bus.js'
import type {PermissionGate} from './permission.js'
import {toChatMessages} from './messages.js'
import {sessionIdFromHeaders} from './session-id.js'
import {sseHeaders} from '../sse.js'
import {harnessDebug} from '../../runtime/harness-logger.js'

export const resumeTokenFor = async (store: SessionStore, id: string): Promise<string | null> =>
  (await store.get(id))?.harnessSessionId ?? null
export const recordMintedToken = (store: SessionStore, id: string, token: string): Promise<unknown> =>
  store.update(id, {harnessSessionId: token})

export const ensureChatRecord = async (
  store: SessionStore,
  id: string,
  harnessKind: string,
  cwd: string,
): Promise<void> => {
  if (await store.get(id)) return
  await store.create({
    id,
    harnessSessionId: null,
    harnessKind,
    origin: 'chat',
    title: null,
    model: null,
    usage: null,
    cwd,
  })
}

export type SpawnHarness = (args: string[], cwd: string, sessionId?: string) => HarnessChild

const COMPACT_FALLBACK_PROMPT =
  'Summarize our conversation so far as concisely as you can: the key decisions, the current state, and any open threads, so we can continue with less context.'

export type TurnDeps = {
  cwd: string
  stateRoot: string
  harness: HarnessAdapter
  spawnHarness: SpawnHarness
  harnessEnv?: (sessionId?: string) => NodeJS.ProcessEnv
  gate: PermissionGate
  systemPromptFile?: string
  systemPromptText?: string
  uiBus: UiBus
  store: SessionStore
  onTurnEnd?: (sessionId: string) => Promise<void>
}

export function registerTurnRoutes(app: H3, deps: TurnDeps): void {
  const {harness, uiBus} = deps

  app.post('/api/chat/ui', async (event) => {
    const spec = await readValidatedBody(event, UiSpecSchema)
    const sessionId = sessionIdFromHeaders(event.req.headers)
    return {renderId: spec.renderId, injected: sessionId ? uiBus.inject(sessionId, spec) : false}
  })

  app.post('/api/chat', async (event) => {
    const sessionId = sessionIdFromHeaders(event.req.headers)
    if (!sessionId) throw new HTTPError({status: 400, message: 'no session (resolve first)'})

    if (!acquireLock(deps.stateRoot, sessionId, 'chat', process.pid)) {
      throw new HTTPError({status: 409, message: 'session busy'})
    }

    try {
      await ensureChatRecord(deps.store, sessionId, harness.id, deps.cwd)
      const chatReq = await readValidatedBody(event, ChatRequestSchema)

      const intent = chatReq.intent ?? chatReq.forwardedProps?.intent ?? chatReq.data?.intent ?? 'chat'
      const turnKind = intent === 'compact' ? 'compact' : 'chat'
      const resumeSessionId = harness.capabilities.resume ? await resumeTokenFor(deps.store, sessionId) : null
      const origin = `http://${event.req.headers.get('host') ?? '127.0.0.1:3000'}`

      const mode = harness.capabilities.systemPrompt
      const sysText = mode === 'file' ? (deps.systemPromptFile ?? '') : (deps.systemPromptText ?? '')
      const abort = new AbortController()
      event.req.signal.addEventListener('abort', () => abort.abort())

      const adapter = harnessText(harness, {
        cwd: deps.cwd,

        spawnHarness: (args, cwd) => deps.spawnHarness(args, cwd, sessionId),
        sessionId,
        env: deps.harnessEnv?.(sessionId) ?? process.env,
        decide: (toolName, input, toolUseId) => deps.gate.decide(toolName, input, sessionId, toolUseId),
        systemPrompt: sysText,
        resumeSessionId,
        permissionUrl: harness.capabilities.permissionGate === 'hook' ? `${origin}/api/chat/permission` : undefined,
        mcpUrl: harness.capabilities.mcp === 'http' ? `${origin}/api/mcp` : undefined,

        model: chatReq.model ?? chatReq.forwardedProps?.model ?? chatReq.data?.model,
        turnKind,
        onSessionId: (id) => {
          void recordMintedToken(deps.store, sessionId, id).catch(() => {})
        },

        onUsage: (usage) => uiBus.injectUsage(sessionId, usage),
        onSpawn: (child) => {
          if (child.pid) updateLockPid(deps.stateRoot, sessionId, 'chat', child.pid)
        },
      })

      const messages = toChatMessages(chatReq)
      if (turnKind === 'compact' && !harness.capabilities.compaction) {
        const lastUser = messages.findLast((m) => m.role === 'user')
        if (lastUser) lastUser.content = COMPACT_FALLBACK_PROMPT
      }

      const stream = chat({
        adapter,
        messages,
        systemPrompts: sysText ? [sysText] : [],
        abortController: abort,
        debug: harnessDebug,
      })

      uiBus.setModel(sessionId, chatReq.model ?? chatReq.forwardedProps?.model ?? chatReq.data?.model ?? null)
      const merged = uiBus.run(sessionId, stream)
      const sse = toServerSentEventsStream(
        withLockRelease(merged, deps.store, deps.stateRoot, sessionId, deps.onTurnEnd),
        abort,
      )
      return new Response(sse, {status: 200, headers: sseHeaders(event)})
    } catch (e) {
      releaseLock(deps.stateRoot, sessionId)
      throw e
    }
  })
}

async function* withLockRelease(
  src: AsyncIterable<StreamChunk>,
  store: SessionStore,
  stateRoot: string,
  sessionId: string,
  onTurnEnd?: (sessionId: string) => Promise<void>,
): AsyncGenerator<StreamChunk> {
  try {
    for await (const c of src) {
      if (c.type === EventType.RUN_FINISHED && c.usage) {
        await store.update(sessionId, {usage: tokenUsageToSnapshot(c.usage)})
      }
      yield c
    }
  } finally {
    releaseLock(stateRoot, sessionId)
    if (onTurnEnd) await onTurnEnd(sessionId).catch(() => {})
  }
}
