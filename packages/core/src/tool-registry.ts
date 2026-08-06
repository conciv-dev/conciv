import {z} from 'zod'
import {
  isPageFailure,
  PageQueryInputSchema,
  PageQueryKindSchema,
  type PageQueryInput,
  type PageQueryKind,
} from '@conciv/protocol/page-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {pageVerbError, toolError, type ToolRequest} from '@conciv/extension'
import {createToolRegistry, type ForwardedPageTool, type ToolRegistry} from '@conciv/extension/registry'
import {BUILTIN_OPEN_TOOL, BUILTIN_PAGE_TOOLS, BUILTIN_SERVER_TOOLS, PAGE_TOOL_PREFIX} from '@conciv/tools/builtins'
import {runVerb, type PageEnv} from './page-bus.js'

export type BuiltinRegistryDeps = {
  page: PageEnv
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
}

export function makeBuiltinRegistry(deps: BuiltinRegistryDeps): ToolRegistry {
  const registry = createToolRegistry({
    pageCaller: (tool, input) => runPageTool(deps.page, tool, input),
    isPageConnected: () => deps.page.bus.connected(),
  })
  for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool)
  for (const tool of BUILTIN_SERVER_TOOLS) registry.register(tool, {context: {bundler: deps.bundler}})
  registry.register(BUILTIN_OPEN_TOOL, {context: {openInEditor: deps.openInEditor}})
  return registry
}

const PageToolInputSchema = z.record(z.string(), z.unknown())

function builtinPageVerb(name: string): PageQueryKind | null {
  if (!name.startsWith(PAGE_TOOL_PREFIX)) return null
  const parsed = PageQueryKindSchema.safeParse(name.slice(PAGE_TOOL_PREFIX.length))
  return parsed.success ? parsed.data : null
}

async function runPageTool(env: PageEnv, tool: ForwardedPageTool, input: unknown): Promise<unknown> {
  const verb = builtinPageVerb(tool.name)
  if (verb === null) return runClientTool(env, tool, input)
  try {
    return await runVerb(env, PageQueryInputSchema.parse(input ?? {}), verb)
  } catch (error) {
    throw attributedTo(tool.name, toolFailureFromPage(tool.name, verb, error))
  }
}

function stringField(record: Record<string, unknown>, key: 'ref' | 'selector'): string | undefined {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

async function runClientTool(env: PageEnv, tool: ForwardedPageTool, input: unknown): Promise<unknown> {
  const record = PageToolInputSchema.parse(input ?? {})
  try {
    const data = await env.bus.ask({kind: 'tool', name: tool.name, input: record})
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

export function callPageTool(
  registry: ToolRegistry,
  env: PageEnv,
  query: PageQueryInput & {kind: string},
  request?: ToolRequest,
): Promise<unknown> {
  const {kind, ...input} = query
  const name = `${PAGE_TOOL_PREFIX}${kind}`
  if (registry.has(name)) return registry.call(name, input, {request})
  const known = PageQueryKindSchema.safeParse(kind)
  if (!known.success) {
    return Promise.reject(pageVerbError('unknown-verb', name, kind, `the page does not know the verb "${kind}"`))
  }
  return runVerb(env, input, known.data)
}
