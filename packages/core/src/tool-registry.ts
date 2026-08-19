import {z} from 'zod'
import {isPageFailure} from '@conciv/protocol/page-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {pageVerbError, toolError, type ToolRequest} from '@conciv/extension'
import {createToolRegistry, type ForwardedPageTool, type ToolRegistry} from '@conciv/extension/registry'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from '@conciv/tools/builtins'
import type {PageAnswer, PageEnv} from './page-bus.js'
import {logError} from './lib/debug.js'

export type BuiltinRegistryDeps = {
  page: PageEnv
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
}

export function makeBuiltinRegistry(deps: BuiltinRegistryDeps): ToolRegistry {
  const registry = createToolRegistry({
    pageCaller: (tool, input, request) => runClientTool(deps.page, tool, input, request),
    isPageConnected: () => deps.page.bus.connected(),
  })
  for (const tool of BUILTIN_SERVER_TOOLS) {
    registry.register(tool, {owner: 'a built-in server tool', context: {bundler: deps.bundler}})
  }
  registry.register(BUILTIN_OPEN_TOOL, {owner: 'a built-in editor tool', context: {openInEditor: deps.openInEditor}})
  return registry
}

const PageToolInputSchema = z.record(z.string(), z.unknown())

function stringField(record: Record<string, unknown>, key: 'ref' | 'selector'): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

async function storeCapture(env: PageEnv, request: ToolRequest | undefined, answer: PageAnswer): Promise<void> {
  const bundle = answer.capture
  const toolCallId = request?.toolCallId
  if (bundle === undefined || request === undefined || toolCallId === undefined) return
  try {
    await env.storeCapture({sessionId: request.sessionId, toolCallId, bundle})
  } catch (error) {
    logError(`[core] an element capture could not be stored: ${String(error)}`)
  }
}

async function runClientTool(
  env: PageEnv,
  tool: ForwardedPageTool,
  input: unknown,
  request: ToolRequest | undefined,
): Promise<unknown> {
  const record = PageToolInputSchema.parse(input ?? {})
  try {
    const answer = await env.bus.ask(request?.sessionId ?? '', {name: tool.name, input: record})
    await storeCapture(env, request, answer)
    const data = answer.result
    if (tool.mutating) {
      const {ref: _ref, selector: _selector, ...args} = record
      env.journal.append(
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
