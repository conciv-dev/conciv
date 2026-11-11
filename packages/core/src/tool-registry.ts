import {z} from 'zod'
import {isPageFailure, PAGE_QUEUE_ASYNC_TOOL, PAGE_QUEUE_TOOL} from '@conciv/protocol/page-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {pageVerbError, toolError, type ToolRequest} from '@conciv/extension'
import {createToolRegistry, type ForwardedPageTool, type ToolRegistry} from '@conciv/extension/registry'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS, BUILTIN_TABS_TOOL} from '@conciv/tools/builtins'
import type {TabsListing} from '@conciv/protocol/chat-types'
import type {PageAnswer, PageEnv} from './page-bus.js'
import {session} from './runtime/session-context.js'
import {logError} from './lib/debug.js'

export type BuiltinRegistryDeps = {
  page: PageEnv
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
  listTabs: () => Promise<TabsListing>
}

export function makeBuiltinRegistry(deps: BuiltinRegistryDeps): ToolRegistry {
  const registry = createToolRegistry({
    pageCaller: (tool, input, request) => runClientTool(deps.page, tool, input, request),
    isAnyPageConnected: () => deps.page.bus.anySubscriber(),
  })
  for (const tool of BUILTIN_SERVER_TOOLS) {
    registry.register(tool, {owner: 'a built-in server tool', context: {bundler: deps.bundler}})
  }
  registry.register(BUILTIN_OPEN_TOOL, {owner: 'a built-in editor tool', context: {openInEditor: deps.openInEditor}})
  registry.register(BUILTIN_TABS_TOOL, {owner: 'a built-in tabs tool', context: {listTabs: deps.listTabs}})
  return registry
}

const PageToolInputSchema = z.record(z.string(), z.unknown())

function stringField(record: Record<string, unknown>, key: 'ref' | 'selector'): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

async function storeCapture(env: PageEnv, request: ToolRequest, answer: PageAnswer): Promise<void> {
  const bundle = answer.capture
  const toolCallId = request.toolCallId
  if (bundle === undefined || toolCallId === undefined) return
  try {
    await env.storeCapture({sessionId: session().id, toolCallId, bundle})
  } catch (error) {
    logError(`[core] an element capture could not be stored: ${String(error)}`)
  }
}

function runQueueTool(env: PageEnv, tool: ForwardedPageTool, record: Record<string, unknown>, request: ToolRequest) {
  const given = {
    agentId: request.agentId,
    input: record,
    outside: request.outside === true,
    toolCallId: request.toolCallId,
  }
  if (tool.name === PAGE_QUEUE_TOOL) return env.queues.play(session().id, given)
  return env.queues.start(session().id, given)
}

async function runClientTool(
  env: PageEnv,
  tool: ForwardedPageTool,
  input: unknown,
  request: ToolRequest,
): Promise<unknown> {
  const record = PageToolInputSchema.parse(input ?? {})
  if (tool.name === PAGE_QUEUE_TOOL || tool.name === PAGE_QUEUE_ASYNC_TOOL) {
    return runQueueTool(env, tool, record, request).catch((error: unknown) => {
      throw attributedTo(tool.name, toolFailureFromPage(tool.name, tool.name, error))
    })
  }
  const sessionId = session().id
  try {
    const answer = await env.bus.ask(
      sessionId,
      {name: tool.name, input: record, agentId: request.agentId, mutating: tool.mutating},
      {mutating: tool.mutating},
      request.signal,
    )
    await storeCapture(env, request, answer)
    const data = answer.result
    if (tool.mutating) {
      const {ref: _ref, selector: _selector, ...args} = record
      await env.journal.append(
        sessionId,
        {verb: tool.name, ref: stringField(record, 'ref'), selector: stringField(record, 'selector'), args},
        Date.now(),
      )
    }
    return data
  } catch (error) {
    throw attributedTo(tool.name, toolFailureFromPage(tool.name, tool.name, error))
  }
}

function attributedTo(tool: string, failure: Error): Error {
  return Object.assign(failure, {message: `${tool}: ${failure.message}`})
}

export function toolFailureFromPage(owner: string, verb: string, error: unknown): Error {
  if (!isPageFailure(error)) {
    const message = error instanceof Error ? error.message : String(error)
    return pageVerbError('handler-error', owner, verb, message)
  }
  const raised = error.error.raised
  if (raised) return toolError(raised.code, {message: raised.message, data: raised.data})
  return pageVerbError(error.error.code, owner, verb, error.error.message)
}
