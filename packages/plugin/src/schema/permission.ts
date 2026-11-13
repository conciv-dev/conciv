export type Source = {
  type: 'tool'
  messageId: string | undefined
  id: string
}

export type Effect = 'allow' | 'deny' | 'ask'

export interface Rule {
  readonly action: string
  readonly resource: string
  readonly effect: Effect
}

export type Ruleset = ReadonlyArray<Rule>
