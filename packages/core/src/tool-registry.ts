import {
  isPageFailure,
  PageQueryInputSchema,
  PageQueryKindSchema,
  type PageQueryInput,
} from '@conciv/protocol/page-types'
import type {BundlerBridge} from '@conciv/protocol/bundler-types'
import {pageVerbError, toolError, type ToolRequest} from '@conciv/extension'
import {createToolRegistry, type ToolRegistry} from '@conciv/extension/registry'
import {
  BUILTIN_OPEN_TOOL,
  BUILTIN_PAGE_TOOLS,
  BUILTIN_SERVER_TOOLS,
  PAGE_TOOL_PREFIX,
  pageVerbOfTool,
} from '@conciv/tools/builtins'
import {runVerb, type PageEnv} from './page-bus.js'

export type BuiltinRegistryDeps = {
  page: PageEnv
  bundler: () => BundlerBridge | undefined
  openInEditor: (file: string, line?: number) => void
}

export function makeBuiltinRegistry(deps: BuiltinRegistryDeps): ToolRegistry {
  const registry = createToolRegistry({
    pageCaller: (name, input) => runPageTool(deps.page, name, input),
    isPageConnected: () => deps.page.bus.connected(),
  })
  for (const tool of BUILTIN_PAGE_TOOLS) registry.register(tool, {owner: 'a built-in page tool'})
  for (const tool of BUILTIN_SERVER_TOOLS) {
    registry.register(tool, {owner: 'a built-in server tool', context: {bundler: deps.bundler}})
  }
  registry.register(BUILTIN_OPEN_TOOL, {owner: 'a built-in editor tool', context: {openInEditor: deps.openInEditor}})
  return registry
}

async function runPageTool(env: PageEnv, name: string, input: unknown): Promise<unknown> {
  const verb = PageQueryKindSchema.parse(pageVerbOfTool(name))
  try {
    return await runVerb(env, PageQueryInputSchema.parse(input ?? {}), verb)
  } catch (error) {
    throw attributedTo(name, toolFailureFromPage(name, verb, error))
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
