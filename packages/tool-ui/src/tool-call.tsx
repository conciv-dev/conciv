import {type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardProps} from './types.js'
import {ApprovalBar} from './approval-bar.js'
import {rendererFor} from './registry.js'

// Render a tool-call part as a card, dispatched by tool name through the open renderer registry
// (built-ins seed it; extensions add/override via registerToolRenderer; GenericCard is the fallback).
// When the part is in tanstack's native approval-requested state, an approval bar renders below the
// card (uniform across every tool — approval is a property of the call, not of any one renderer).
export function ToolCallCard(props: ToolCardProps): JSX.Element {
  return (
    <>
      <ByName {...props} />
      <ApprovalBar part={props.part} ctx={props.ctx} />
    </>
  )
}

function ByName(props: ToolCardProps): JSX.Element {
  return <Dynamic component={rendererFor(props.part.name)} {...props} />
}
