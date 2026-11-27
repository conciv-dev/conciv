export type PageState = {
  readonly heading: string
  readonly button: string
  readonly count: number
}

export type PageEdit = Partial<PageState>

export type PermissionAnswer = 'Allow once' | 'Allow always' | 'Deny'

export type Ask = {
  readonly title: string
  readonly always?: boolean
  readonly answer: PermissionAnswer
}

export type PluginEvent = {
  readonly type: `rpc.${string}`
  readonly data: Readonly<Record<string, unknown>>
}

export type ToolReply = {
  readonly kind: 'tool'
  readonly name: string
  readonly input: Readonly<Record<string, unknown>>
  readonly result: unknown
  readonly mode?: 'direct' | 'code'
  readonly failed?: boolean
  readonly ask?: Ask
  readonly page?: PageEdit
  readonly events?: readonly PluginEvent[]
}

export type Reply =
  | {readonly kind: 'text'; readonly text: string}
  | {readonly kind: 'thinking'; readonly text: string}
  | ToolReply

export type UiStep =
  | {readonly kind: 'click'; readonly role: string; readonly label: string}
  | {readonly kind: 'point'; readonly role: string; readonly label: string}

export type Turn = {
  readonly prompt: string
  readonly queued?: boolean
  readonly before?: readonly UiStep[]
  readonly replies: readonly Reply[]
  readonly after?: readonly UiStep[]
}

export type PlaygroundPluginId = 'test-runner' | 'project-version' | 'shelf'

export type PlaygroundScript = {
  readonly title: string
  readonly screen: 'panel' | 'quick'
  readonly plugins: readonly PlaygroundPluginId[]
  readonly turns: readonly Turn[]
}

export const INITIAL_PAGE: PageState = {heading: 'Get started', button: 'Count is', count: 0}
