import {Switch, Match, type JSX} from 'solid-js'
import type {ToolCardProps} from './types.js'
import {GenericCard} from './cards/generic.js'
import {ShellCard} from './cards/shell.js'

// Render a tool-call part as a card, dispatched by tool name — the tanstack convention (the docs'
// MessageComponent does `if (part.name === '…')`). Unknown names fall back to the generic card. New
// tools are added by writing a card and one <Match> here; there is no registry.
export function ToolCallCard(props: ToolCardProps): JSX.Element {
  return (
    <Switch fallback={<GenericCard part={props.part} result={props.result} ctx={props.ctx} />}>
      <Match when={props.part.name === 'Bash'}>
        <ShellCard part={props.part} result={props.result} ctx={props.ctx} />
      </Match>
    </Switch>
  )
}
