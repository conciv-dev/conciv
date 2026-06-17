import {Show, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolAccent} from './types.js'
import {toolGlyph} from './util.js'

// Shared card chrome: family-accent rail, icon, title, lifecycle glyph, optional right-aligned
// meta, and the kind-specific body as children.
export function ToolCard(props: {
  accent: ToolAccent
  Icon: Component
  title: string
  part: ToolCallPart
  result: ToolResultPart | undefined
  meta?: string
  children?: JSX.Element
}): JSX.Element {
  return (
    <div class={`pw-tool pw-tool--${props.accent}`}>
      <div class="pw-tool-head">
        <span class="pw-tool-ic" aria-hidden="true">
          <Dynamic component={props.Icon} />
        </span>
        <span class="pw-tool-title">{props.title}</span>
        <span class={`pw-tool-glyph pw-tool-glyph--${toolGlyph(props.part, props.result)}`} aria-hidden="true" />
        <Show when={props.meta}>
          <span class="pw-tool-meta">{props.meta}</span>
        </Show>
      </div>
      <Show when={props.children}>
        <div class="pw-tool-body">{props.children}</div>
      </Show>
    </div>
  )
}
