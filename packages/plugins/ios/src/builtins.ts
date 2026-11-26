import {Effect} from 'effect'
import type {Plugin} from '@conciv/frontend-plugin-api'
import type {GrabProvider} from '@conciv/grab'
import {makeNativeService} from './client.js'

type IosBuiltins = {
  readonly builtins: readonly {readonly id: string; readonly plugin: Plugin.Definition}[]
  readonly grabProvider: GrabProvider | undefined
  readonly apiBase: string
}

export const builtins = makeNativeService.pipe(
  Effect.map((native): IosBuiltins => ({
    builtins: native ? [{id: 'ios', plugin: {setup: native.setup}}] : [],
    grabProvider: native?.grabProvider,
    apiBase: window.location.origin,
  })),
)
