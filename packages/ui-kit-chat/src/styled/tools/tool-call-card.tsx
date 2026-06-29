import {type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@mandarax/protocol/tool-view-types'
import {ToolFallback} from '../tool-fallback.js'
import {PermissionCard} from './permission-card.js'

export type ToolCallCardProps = ToolCardProps & {
  // Self-describing entries matched by name (extension tools first so they can override a built-in).
  tools?: () => ToolCardEntry[]
  // The card for an unmatched tool name (defaults to the generic ToolFallback).
  fallback?: ToolUIComponent
}

// Render a tool-call part as a card: the entry whose names include this part's name, else the
// fallback. The native approval prompt (PermissionCard) renders below whenever the call awaits
// approval — uniform across every tool, since approval is a property of the call, not the card.
// The single dispatcher shared by standalone consumers (whiteboard pins, etc.) and the styled Thread.
export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const render = (): ToolUIComponent =>
    props.tools?.().find((entry) => entry.names.includes(props.part.name))?.render ?? props.fallback ?? ToolFallback
  return (
    <>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={props.durationMs}
      />
      <PermissionCard part={props.part} result={props.result} ctx={props.ctx} />
    </>
  )
}
