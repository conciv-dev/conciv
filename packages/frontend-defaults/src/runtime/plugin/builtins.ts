import {compose, type Entry} from '@conciv/frontend-plugin-api/host'
import type {Plugin} from '@conciv/frontend-plugin-api'
import {GrabPicker} from '@conciv/frontend-plugin-api/grab'
import type {ToolGroup} from '@internal/frontend-app-api'
import {useHostApis} from './host-apis-context'

export type DeclaredToolGroup = ToolGroup & {readonly plugin: string}

export type BuiltinPlugins = {
  readonly entries: readonly Entry[]
  readonly serverBuiltins: readonly string[]
  readonly toolGroups?: readonly DeclaredToolGroup[]
}

const provideGrab: Plugin.Setup = (ctx) => {
  const provider = useHostApis().grabProvider
  if (provider) ctx.add(GrabPicker, provider())
}

const shellBuiltins = compose({grab: {windowEntry: () => Promise.resolve({default: provideGrab})}})

export function withShellBuiltins(builtins: BuiltinPlugins | undefined): BuiltinPlugins {
  return {
    entries: [...shellBuiltins, ...(builtins?.entries ?? [])],
    serverBuiltins: builtins?.serverBuiltins ?? [],
    toolGroups: builtins?.toolGroups ?? [],
  }
}
