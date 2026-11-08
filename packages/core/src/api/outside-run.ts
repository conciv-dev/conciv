import {z} from 'zod'
import {createMCPClient} from '@conciv/ai/server'
import type {CodeCapability} from '@conciv/chat'
import {toolError} from '@conciv/extension'
import type {ContentPart} from '@conciv/protocol/chat-message-types'
import {
  CONCIV_CLIENT_HEADER,
  CONCIV_ORIGIN_HEADER,
  CONCIV_SESSION_HEADER,
  HUB_FORWARD_ORIGIN,
  SessionId,
} from '@conciv/protocol/chat-types'
import {BUILTIN_TABS_TOOL, TABS_GUIDANCE} from '@conciv/tools/builtins'
import {logError} from '../lib/debug.js'
import type {createOutsideTabs} from './outside-tabs.js'
import {EXECUTE_TOOL_NAME} from './execute-schemas.js'

type OutsideTabs = ReturnType<typeof createOutsideTabs>

type PickedTab = Awaited<ReturnType<OutsideTabs['find']>> & {id: SessionId}

const USE_TAB_NAME = 'use_tab'

const NO_TAB_MESSAGE = 'call external_use_tab({id}) first; external_tabs({}) lists the open tabs'

const UseTabInputSchema = z.object({id: SessionId})

const ReplyPartSchema = z.object({
  type: z.string(),
  text: z.string().optional(),
  data: z.string().optional(),
  mimeType: z.string().optional(),
})

const ReplySchema = z.object({content: z.array(ReplyPartSchema), isError: z.boolean().optional()})

const SuccessSchema = z.object({result: z.unknown()})

const FailureSchema = z.object({error: z.object({message: z.string(), code: z.string().optional()})})

export function outsideRunCapabilities(deps: {
  tabs: OutsideTabs
  client: string | null
  capabilities: readonly CodeCapability[]
}): CodeCapability[] {
  const picked: {tab: PickedTab | null} = {tab: null}
  const useTab: CodeCapability = {
    name: USE_TAB_NAME,
    description: `Pick the conciv tab that the following calls in this execute_typescript block act on, and return its instructions and a one-line summary of each tool (discover_tools gives the typed signatures). The pick lasts for this block only. ${TABS_GUIDANCE}`,
    errors: [{code: 'TAB_NOT_OPEN', message: 'the tab is not open on any running conciv engine'}],
    inputSchema: UseTabInputSchema,
    execute: async (input) => {
      const {id} = UseTabInputSchema.parse(input)
      const found = await deps.tabs.find(id)
      picked.tab = {...found, id}
      return {
        instructions: found.instructions,
        tools: found.tools.map((tool) => ({name: tool.name, summary: tool.description.split('\n')[0] ?? ''})),
      }
    },
  }
  const forwarded = deps.capabilities
    .filter((capability) => capability.approval !== 'ask')
    .map((capability): CodeCapability => {
      if (capability.name === BUILTIN_TABS_TOOL.name) return capability
      return {
        ...capability,
        errors: [...capability.errors, {code: 'NO_TAB', message: NO_TAB_MESSAGE}],
        execute: (input) => {
          if (picked.tab === null) throw toolError('NO_TAB', {message: NO_TAB_MESSAGE})
          return forward(picked.tab, deps.client, capability.name, input)
        },
      }
    })
  return [useTab, ...forwarded]
}

async function forward(tab: PickedTab, client: string | null, name: string, input: unknown): Promise<unknown> {
  const headers = {
    [CONCIV_SESSION_HEADER]: tab.id,
    [CONCIV_ORIGIN_HEADER]: HUB_FORWARD_ORIGIN,
    ...(client === null ? {} : {[CONCIV_CLIENT_HEADER]: client}),
  }
  const typescriptCode = `return await external_${name}(${JSON.stringify(input ?? {})})`
  const reply = await callOwner(tab, headers, typescriptCode)
  const text = reply.content.flatMap((part) => (part.text === undefined ? [] : [part.text])).join('\n')
  const parsed = parsedJson(text)
  if (reply.isError === true) {
    const failure = FailureSchema.safeParse(parsed)
    if (!failure.success) throw new Error(text)
    const {code, message} = failure.data.error
    throw code === undefined ? new Error(message) : toolError(code, {message})
  }
  if (reply.content.some((part) => part.type === 'image')) return reply.content.map(contentPart)
  const success = SuccessSchema.safeParse(parsed)
  return success.success ? success.data.result : text
}

function contentPart(part: z.infer<typeof ReplyPartSchema>): ContentPart {
  if (part.type === 'image' && part.data !== undefined) {
    return {
      type: 'image',
      source: {type: 'data', value: part.data, mimeType: part.mimeType ?? 'application/octet-stream'},
    }
  }
  return {type: 'text', content: part.text ?? ''}
}

async function callOwner(tab: PickedTab, headers: Record<string, string>, typescriptCode: string) {
  try {
    const owner = await createMCPClient({
      transport: {type: 'http', url: `${tab.apiBase}/api/mcp`, headers},
      name: 'conciv-runner',
    })
    try {
      return ReplySchema.parse(await owner.callTool(EXECUTE_TOOL_NAME, {typescriptCode}))
    } finally {
      await owner
        .close()
        .catch((error: unknown) => logError(`[mcp] closing the client of ${tab.root} failed: ${String(error)}`))
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`the conciv engine at ${tab.root} stopped answering (${reason})`, {cause: error})
  }
}

function parsedJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
