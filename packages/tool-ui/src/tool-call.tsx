import {Switch, Match, type JSX} from 'solid-js'
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

// Render a tool-call part as a card, dispatched by tool name — the tanstack convention (the
// api/ai-solid docs render manually with `if (part.name === '…')`; there is no component registry).
// aidx's own tools are matched by their MCP names; the rest are the harness CLI's built-in tools.
// Unknown names fall back to the generic card. Adding a tool = a card + one <Match> here.
export function ToolCallCard(props: ToolCardProps): JSX.Element {
  return (
    <Switch fallback={<GenericCard part={props.part} result={props.result} ctx={props.ctx} />}>
      <Match when={props.part.name === 'Bash'}>
        <ShellCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'Edit' || props.part.name === 'MultiEdit' || props.part.name === 'Write'}>
        <FileEditCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'Read' || props.part.name === 'aidx_open'}>
        <FileReadCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'Grep' || props.part.name === 'Glob'}>
        <SearchCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'TodoWrite'}>
        <TodoCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'aidx_page'}>
        <PageActionCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'aidx_ui'}>
        <UiCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
      <Match when={props.part.name === 'aidx_test'}>
        <TestCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
    </Switch>
  )
}
