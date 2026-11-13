export * as App from './app.js'

import {Context} from 'effect'

export interface Info {
  readonly name: string
  readonly version: string
  readonly channel: string
}

export const Service = Context.Service<Info>('@opencode/App')

export function make(input: Partial<Info> = {}): Info {
  return {
    name: input.name ?? 'conciv',
    version: input.version ?? 'unknown',
    channel: input.channel ?? 'unknown',
  }
}
