import {z} from 'zod'
import type {CodeCapability} from '@conciv/chat'
import {toolError} from '@conciv/extension'
import {CONCIV_CLIENT_HEADER, CONCIV_ORIGIN_HEADER, CONCIV_SESSION_HEADER, SessionId} from '@conciv/protocol/chat-types'
import {BUILTIN_TABS_TOOL, TABS_GUIDANCE} from '@conciv/tools/builtins'
import type {createOutsideTabs} from './outside-tabs.js'
import type {createOwnerCalls} from './owner-calls.js'

type OutsideTabs = ReturnType<typeof createOutsideTabs>

type CallOwner = ReturnType<typeof createOwnerCalls>

type PickedTab = Awaited<ReturnType<OutsideTabs['find']>> & {id: SessionId}

const USE_TAB_NAME = 'use_tab'

const NO_TAB_MESSAGE = 'call external_use_tab({id}) first; external_tabs({}) lists the open tabs'

const UseTabInputSchema = z.object({id: SessionId})

const InputSchema = z.record(z.string(), z.unknown())

export function outsideRunCapabilities(deps: {
  tabs: OutsideTabs
  client: string | null
  capabilities: readonly CodeCapability[]
  signal: AbortSignal
  callOwner: CallOwner
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
          return forward(picked.tab, deps, capability.name, input)
        },
      }
    })
  return [useTab, ...forwarded]
}

type Caller = {client: string | null; signal: AbortSignal; callOwner: CallOwner}

function forward(tab: PickedTab, caller: Caller, name: string, input: unknown): Promise<unknown> {
  const headers = {
    [CONCIV_SESSION_HEADER]: tab.id,
    [CONCIV_ORIGIN_HEADER]: 'hub',
    ...(caller.client === null ? {} : {[CONCIV_CLIENT_HEADER]: caller.client}),
  }
  return caller.callOwner(tab, {headers, name, input: InputSchema.parse(input ?? {}), signal: caller.signal})
}
