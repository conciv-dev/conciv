import {BUILTIN_TABS_TOOL} from './builtins/server-tools.js'

export {BUILTIN_TABS_TOOL, type TabsToolContext} from './builtins/server-tools.js'
export type {BuiltinCategory} from './builtins/shared.js'

export function builtinToolNames(): string[] {
  return [BUILTIN_TABS_TOOL.name]
}
