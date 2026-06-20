// The open tool-renderer registry: built-in cards seed it by tool name; registerToolRenderer adds or
// overrides entries; rendererFor resolves a name to a card (GenericCard is the fallback). Overrides
// live in a signal so a post-mount extension registration re-renders already-mounted cards. This
// replaces the static by-name Switch that tool-call.tsx used to hold.
import {createSignal, type Component} from 'solid-js'
import type {ToolCardProps} from './types.js'
import {GenericCard} from './cards/generic.js'
import {ShellCard} from './cards/shell.js'
import {FileEditCard} from './cards/file-edit.js'
import {FileReadCard} from './cards/file-read.js'
import {SearchCard} from './cards/search.js'
import {TodoCard} from './cards/todo.js'
import {PageActionCard} from './cards/page-action.js'
import {UiCard} from './cards/ui-chip.js'
import {TestCard} from './cards/test.js'

export const BUILTIN_TOOL_RENDERERS: Record<string, Component<ToolCardProps>> = {
  Bash: ShellCard,
  Edit: FileEditCard,
  MultiEdit: FileEditCard,
  Write: FileEditCard,
  Read: FileReadCard,
  mandarax_open: FileReadCard,
  Grep: SearchCard,
  Glob: SearchCard,
  TodoWrite: TodoCard,
  mandarax_page: PageActionCard,
  mandarax_ui: UiCard,
  mandarax_test: TestCard,
}

const [overrides, setOverrides] = createSignal<Record<string, Component<ToolCardProps>>>({})

export function registerToolRenderer(name: string, renderer: Component<ToolCardProps>): void {
  setOverrides((prev) => ({...prev, [name]: renderer}))
}

export function rendererFor(name: string): Component<ToolCardProps> {
  return overrides()[name] ?? BUILTIN_TOOL_RENDERERS[name] ?? GenericCard
}
