import {type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardProps, ToolCardEntry} from './types.js'
import {ApprovalBar} from './approval-bar.js'
import {GenericCard} from './cards/generic.js'

export type ToolCallCardProps = ToolCardProps & {tools?: () => ToolCardEntry[]}

// Render a tool-call part as a card: find the tool whose names include this part's name from the
// passed array (extension tools first, so an extension can override a built-in name — Pi's same-name
// override), else the generic card. An approval bar renders below when the part is in tanstack's
// native approval-requested state (uniform across every tool — approval is a property of the call).
export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const render = (): Component<ToolCardProps> =>
    props.tools?.().find((t) => t.names.includes(props.part.name))?.render ?? GenericCard
  return (
    <>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={props.durationMs}
      />
      <ApprovalBar part={props.part} ctx={props.ctx} />
    </>
  )
}
