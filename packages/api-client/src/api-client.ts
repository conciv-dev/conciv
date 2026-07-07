import {createSignal} from 'solid-js'
import {hc} from 'hono/client'
import type {AppType} from '@conciv/core'
import {
  CONCIV_SESSION_HEADER,
  type SessionId,
  type SessionClient,
  ChatSessionSchema,
  ChatSessionsSchema,
  ChatHistorySchema,
  ChatModelsSchema,
  ChatCommandsSchema,
  ChatToolsSchema,
  ChatLaunchSchema,
  ResolveResponseSchema,
  RenameResponseSchema,
  OkSchema,
} from '@conciv/protocol/chat-types'
import {PageReplySchema} from '@conciv/protocol/page-types'
import type {z} from 'zod'

export type ApiError = Error & {path: string; status: number}
export function apiError(path: string, status: number): ApiError {
  return Object.assign(new Error(`${path} → ${status}`), {path, status})
}

type ParseableResponse = {ok: boolean; status: number; url: string; json: () => Promise<unknown>}

async function parsed<Output>(
  request: Promise<ParseableResponse>,
  schema: {parse: (value: unknown) => Output},
): Promise<Output> {
  const response = await request
  if (!response.ok) throw apiError(new URL(response.url).pathname, response.status)
  return schema.parse(await response.json())
}

function trimBase(apiBase: string): string {
  return apiBase.replace(/\/+$/, '')
}

export function defineClient(opts: {apiBase: string}): SessionClient {
  const [sessionId, setSessionId] = createSignal<SessionId | null>(null)

  const sessionHeaders = (): Record<string, string> => {
    const id = sessionId()
    return id ? {[CONCIV_SESSION_HEADER]: id} : {}
  }
  const base = trimBase(opts.apiBase)
  const chat = hc<AppType>(base, {init: {credentials: 'include'}, headers: sessionHeaders}).api.chat
  return {
    sessionId,
    setSessionId,

    chatStreamUrl: () => `${base}/api/chat`,
    attachUrl: () => `${base}/api/chat/attach`,
    chatHeaders: sessionHeaders,

    resolve: (body) => parsed(chat.session.resolve.$post({json: body ?? {}}), ResolveResponseSchema),
    session: () => parsed(chat.session.$get(), ChatSessionSchema),
    sessions: () => parsed(chat.sessions.$get(), ChatSessionsSchema),
    history: () => parsed(chat.history.$get(), ChatHistorySchema),
    models: () => parsed(chat.models.$get(), ChatModelsSchema),
    commands: () => parsed(chat.commands.$get(), ChatCommandsSchema),
    tools: () => parsed(chat.tools.$get(), ChatToolsSchema),
    rename: (body) => parsed(chat.sessions.title.$post({json: body}), RenameResponseSchema),
    launch: (body) => parsed(chat.launch.$post({json: body ?? {}}), ChatLaunchSchema),
    remove: () => parsed(chat.session.$delete(), OkSchema),
    stop: () => parsed(chat.stop.$post(), OkSchema),
    permissionDecision: (body) => parsed(chat['permission-decision'].$post({json: body}), OkSchema),
  }
}

export type PageBusClient = {
  reply: (body: z.input<typeof PageReplySchema>) => Promise<z.output<typeof OkSchema>>
  stream: () => EventSource
}

export function definePageBusClient(opts: {apiBase: string}): PageBusClient {
  const base = trimBase(opts.apiBase)
  const page = hc<AppType>(base, {init: {credentials: 'include'}}).api.page
  return {
    reply: (body) => parsed(page.reply.$post({json: body}), OkSchema),
    stream: () => new EventSource(`${base}/api/page/stream`, {withCredentials: true}),
  }
}

export type {SessionClient, RequestMeta} from '@conciv/protocol/chat-types'
