import {Switch, Match, type JSX} from 'solid-js'
import type {ToolCardProps} from './types.js'
import {ApprovalBar} from './approval-bar.js'
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
// mandarax's own tools are matched by their MCP names; the rest are the harness CLI's built-in tools.
// Unknown names fall back to the generic card. Adding a tool = a card + one <Match> here. When the
// part is in tanstack's native approval-requested state, an approval bar renders below the card
// (uniform across every tool — approval is a property of the call, not of any one renderer).
export function ToolCallCard(props: ToolCardProps): JSX.Element {
  return (
    <>
      <ByName {...props} />
      <ApprovalBar part={props.part} ctx={props.ctx} />
    </>
  )
}

function ByName(props: ToolCardProps): JSX.Element {
  return (
    <Switch fallback={<GenericCard {...props} />}>
      <Match when={props.part.name === 'Bash'}>
        <ShellCard {...props} />
      </Match>
      <Match when={props.part.name === 'Edit' || props.part.name === 'MultiEdit' || props.part.name === 'Write'}>
        <FileEditCard {...props} />
      </Match>
      <Match when={props.part.name === 'Read' || props.part.name === 'mandarax_open'}>
        <FileReadCard {...props} />
      </Match>
      <Match when={props.part.name === 'Grep' || props.part.name === 'Glob'}>
        <SearchCard {...props} />
      </Match>
      <Match when={props.part.name === 'TodoWrite'}>
        <TodoCard {...props} />
      </Match>
      <Match when={props.part.name === 'mandarax_page'}>
        <PageActionCard {...props} />
      </Match>
      <Match when={props.part.name === 'mandarax_ui'}>
        <UiCard {...props} />
      </Match>
      <Match when={props.part.name === 'mandarax_test'}>
        <TestCard {...props} />
      </Match>
    </Switch>
  )
}
