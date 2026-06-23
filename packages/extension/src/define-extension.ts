import type {Component} from 'solid-js'
import type {ThemeTokens} from '@mandarax/ui-kit-system'
import type {
  ClientFactoryResult,
  ExtensionHostContext,
  ServerContribution,
  ExtensionSlot,
  ExtensionTool,
} from './types.js'
import {useExtensionRuntimeContext} from './runtime-context.js'

export type ExtensionBuilder<ClientReturnValue extends object> = {
  name: string
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  tools?: ExtensionTool[]
  __client?: () => ClientFactoryResult<ClientReturnValue>
  __server?: () => ServerContribution
  useSlot: () => () => ExtensionSlot
  useContext: {
    (): ExtensionHostContext & ClientReturnValue
    <Selected>(select: (context: ExtensionHostContext & ClientReturnValue) => Selected): Selected
  }
  client: <ReturnValue extends object>(
    factory: () => ClientFactoryResult<ReturnValue>,
  ) => ExtensionBuilder<ClientReturnValue & ReturnValue>
  server: (factory: () => ServerContribution) => ExtensionBuilder<ClientReturnValue>
}

export type ExtensionMeta = {
  name: string
  Component?: Component
  systemPrompt?: string
  theme?: ThemeTokens
  tools?: ExtensionTool[]
}

export function defineExtension(meta: ExtensionMeta): ExtensionBuilder<Record<never, never>> {
  function useSlot(): () => ExtensionSlot {
    const context = useExtensionRuntimeContext()
    return () => context.currentSlot
  }
  function useContext<Selected>(select?: (context: ExtensionHostContext) => Selected): ExtensionHostContext | Selected {
    const context = useExtensionRuntimeContext()
    return select ? select(context) : context
  }
  const builder = {
    name: meta.name,
    Component: meta.Component,
    systemPrompt: meta.systemPrompt,
    theme: meta.theme,
    tools: meta.tools,
    useSlot,
    useContext,
    client(factory: () => ClientFactoryResult<object>) {
      builder.__client = factory
      return builder
    },
    server(factory: () => ServerContribution) {
      builder.__server = factory
      return builder
    },
  } as unknown as ExtensionBuilder<Record<never, never>>
  return builder
}
