import {Show, createSignal, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Collapsible} from '@ark-ui/solid/collapsible'
import {ChevronDown} from 'lucide-solid'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolAccent} from './types.js'
import {toolGlyph, formatDuration} from './util.js'

// Shared card chrome: family-accent rail, icon, title, lifecycle glyph, optional right-aligned meta,
// and the kind-specific body as children. The header is an Ark Collapsible trigger so the user can
// minimize a card; state is a controlled local signal (the card instance is position-stable under the
// thread's <Index>, so the choice survives streaming re-renders — no per-token reset).
export function ToolCard(props: {
  accent: ToolAccent
  Icon: Component
  title: string
  part: ToolCallPart
  result: ToolResultPart | undefined
  meta?: string
  durationMs?: number
  children?: JSX.Element
}): JSX.Element {
  const [open, setOpen] = createSignal(true)
  // Card-specific meta (e.g. a diff stat or line range) wins; otherwise show the call's wall-clock,
  // matching the mockup's mono "0.4s" on the right of the header.
  const meta = (): string | undefined => props.meta ?? formatDuration(props.durationMs)
  return (
    <Collapsible.Root
      open={open()}
      onOpenChange={(details) => setOpen(details.open)}
      class={`pw-tool pw-tool--${props.accent}${toolGlyph(props.part, props.result) === 'error' ? ' pw-tool--err' : ''}`}
    >
      <Collapsible.Trigger class="pw-tool-head">
        <span class="pw-tool-ic" aria-hidden="true">
          <Dynamic component={props.Icon} />
        </span>
        <span class="pw-tool-title">{props.title}</span>
        <span class={`pw-tool-glyph pw-tool-glyph--${toolGlyph(props.part, props.result)}`} aria-hidden="true" />
        <Show when={meta()}>
          <span class="pw-tool-meta">{meta()}</span>
        </Show>
        <Show when={props.children}>
          <ChevronDown class="pw-tool-chevron" size={14} aria-hidden="true" />
        </Show>
      </Collapsible.Trigger>
      <Show when={props.children}>
        <Collapsible.Content class="pw-tool-content">
          <div class="pw-tool-body">{props.children}</div>
        </Collapsible.Content>
      </Show>
    </Collapsible.Root>
  )
}
