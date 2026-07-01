import {Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {ToolFallback} from '../tool-fallback.js'
import {ToolDurationProvider} from '../../primitives/tools/tool-duration.js'
import {PermissionCard} from './permission-card.js'

export type ToolCallCardProps = ToolCardProps & {
  // Self-describing entries matched by name (extension tools first so they can override a built-in).
  tools?: () => ToolCardEntry[]
  // The card for an unmatched tool name (defaults to the generic ToolFallback).
  fallback?: ToolUIComponent
}

// Render a tool-call part as a card: the entry whose names include this part's name, else the
// fallback. A MATCHED concrete card is a thin renderer that doesn't show approval, so the dispatcher
// appends PermissionCard below it. The fallback (assistant-ui's ToolFallback) renders its own
// approval prompt (ToolFallback.Approval), so we DON'T double it there. The single dispatcher shared
// by standalone consumers (whiteboard pins, etc.) and the styled Thread.
export function ToolCallCard(props: ToolCallCardProps): JSX.Element {
  const matched = () => props.tools?.().find((entry) => entry.names.includes(props.part.name))
  const render = (): ToolUIComponent => matched()?.render ?? props.fallback ?? ToolFallback
  return (
    <ToolDurationProvider value={() => props.durationMs}>
      <Dynamic
        component={render()}
        part={props.part}
        result={props.result}
        ctx={props.ctx}
        durationMs={props.durationMs}
      />
      <Show when={matched()}>
        <PermissionCard part={props.part} result={props.result} ctx={props.ctx} />
      </Show>
    </ToolDurationProvider>
  )
}
