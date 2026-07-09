import type {Component, ComponentProps} from 'solid-js'
import type {DialogApi, PopoverApi} from '@conciv/ui-kit-system'
import type {GrabApi} from '@conciv/grab'
import type {LocateResult} from '@conciv/protocol/page-introspect-types'
import type {OpenSourceResult} from '@conciv/protocol/page-types'
import type {ExtensionTableCollection, StateClient, sessionsCollection} from '@conciv/db'

export type ExtensionTableDecl = {name: string; columns: string}

export type HostState = {
  client: StateClient
  sessions: ReturnType<typeof sessionsCollection>
  activeSession: () => string | null
  table(name: string): ExtensionTableCollection
}

export type HostChat = {
  send(text: string): void
  insert(text: string): void
  respondApproval(id: string, approved: boolean): void
}

export type HostUi = {
  notify(message: string, tone?: 'info' | 'success' | 'error'): void
  dialog(): DialogApi
  popover(): {
    Root: Component<ComponentProps<PopoverApi['Root']>>
    Positioner: Component<ComponentProps<PopoverApi['Positioner']>>
    Content: Component<ComponentProps<PopoverApi['Content']>>
  }
  surface(): HTMLElement
}

export type PageAgent = {
  elementAt(x: number, y: number): Element | null
  describe(host: Element): {component: string; file: string | null}
  locate(el: Element): Promise<LocateResult | null>
  openSource(loc: LocateResult): Promise<OpenSourceResult>
  grab: GrabApi
}

export type HostApi = {
  state: HostState
  chat: HostChat
  ui: HostUi
  page: PageAgent
}

export type ComposerActionDecl = {
  id: string
  label: string
  icon: Component<{class?: string}>
  run(host: HostApi): void
}

export type ComposerControlDecl = {id: string; Component: Component}
