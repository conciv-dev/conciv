import {randomUUID} from 'node:crypto'
import {createCodeMode, type IsolateDriver} from '@tanstack/ai-code-mode'
import {createNodeIsolateDriver, probeIsolatedVm} from '@tanstack/ai-isolate-node'
import type {AnyTool} from '@tanstack/ai'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {toChatTool} from './runtime.js'
import type {PermissionGate} from './gate.js'

const CODE_MODE_TIMEOUT_MS = 150_000

let cachedDriver: IsolateDriver | null = null

function getDriver(): IsolateDriver | null {
  if (cachedDriver) return cachedDriver
  if (!probeIsolatedVm().compatible) return null
  cachedDriver = createNodeIsolateDriver({timeout: CODE_MODE_TIMEOUT_MS})
  return cachedDriver
}

export function gatedToolRun(
  tool: ExtensionServerTool,
  request: ToolRequest,
  gate: PermissionGate,
): (args: unknown) => Promise<unknown> {
  return async (args) => {
    const decision = await gate.decide(tool.name, args, request.sessionId, randomUUID())
    if (decision === 'deny') throw new Error(`Tool "${tool.name}" was denied by the user`)
    return tool.execute(args, request)
  }
}

const UNSAFE_IDENTIFIER_CHARS = /[^A-Za-z0-9_$]/g
const LEADING_DIGIT = /^[0-9]/

function sanitizeIdentifier(name: string): string {
  const replaced = name.replace(UNSAFE_IDENTIFIER_CHARS, '_')
  return LEADING_DIGIT.test(replaced) ? `_${replaced}` : replaced
}

function uniqueIdentifier(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base
  const suffix = {value: 2}
  while (taken.has(`${base}_${suffix.value}`)) suffix.value += 1
  return `${base}_${suffix.value}`
}

export function withBindingNames(
  extensionTools: ExtensionServerTool[],
): {tool: ExtensionServerTool; bindingName: string}[] {
  const taken = new Set<string>()
  return extensionTools.map((tool) => {
    const bindingName = uniqueIdentifier(sanitizeIdentifier(tool.name), taken)
    taken.add(bindingName)
    return {tool, bindingName}
  })
}

export function makeCodeMode(
  extensionTools: ExtensionServerTool[],
  request: ToolRequest,
  gate: PermissionGate,
): {tools: AnyTool[]; systemPrompt: string} | null {
  if (extensionTools.length === 0) return null
  const driver = getDriver()
  if (driver === null) return null
  const tools = withBindingNames(extensionTools).map(({tool, bindingName}) =>
    toChatTool({...tool, name: bindingName}, gatedToolRun(tool, request, gate), {lazy: true}),
  )
  const codeMode = createCodeMode({
    driver,
    tools,
    timeout: CODE_MODE_TIMEOUT_MS,
    lazyToolsConfig: {includeDescription: 'first-sentence'},
  })
  return {tools: codeMode.tools, systemPrompt: codeMode.systemPrompt}
}
