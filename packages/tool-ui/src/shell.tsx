import {Show, createSignal, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Collapsible} from '@mandarax/ui-kit-system'
import {ChevronDown} from 'lucide-solid'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolAccent} from './types.js'
import {toolGlyph, formatDuration, type ToolGlyph} from './util.js'

// Glassy gradient panel (faithful port of .pw-tool): 135deg white-on-dark sheen + composite shadow + a
// 1px top-sheen hairline (::before). Border is top/right/bottom (line-soft) + a 2px left rail whose color
// comes per family from ACCENT_RAIL. BG and left-color are separate so the error state swaps them cleanly.
const TOOL =
  "relative overflow-hidden font-pw text-pw-text border-t border-r border-b border-t-pw-line-soft border-r-pw-line-soft border-b-pw-line-soft border-l-2 rounded-pw-sm py-2 px-2.5 my-1.5 text-[0.8125rem] [box-shadow:inset_0_1px_0_oklch(1_0_0/0.1),0_1px_3px_oklch(0_0_0/0.1)] before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(90deg,transparent,oklch(1_0_0/0.2),transparent)]"
const GLASS_BG = 'bg-[linear-gradient(135deg,oklch(1_0_0/0.08),oklch(1_0_0/0.03))]'
// Error tint wins over the family rail: red rail + red-washed gradient.
const ERR_BG = 'border-l-pw-danger bg-[linear-gradient(135deg,oklch(0.72_0.15_25/0.12),oklch(0.72_0.15_25/0.05))]'
const ACCENT_RAIL: Record<ToolAccent, string> = {
  page: 'border-l-pw-accent',
  code: 'border-l-pw-agent',
  test: 'border-l-pw-warn',
  read: 'border-l-pw-read',
  neutral: 'border-l-pw-line-2',
}
// Header doubles as the Ark Collapsible trigger (a button) — the reset zeroes its native chrome.
const HEAD = 'flex items-center gap-1.75 w-full min-w-0 bg-transparent [border:0] p-0 text-left cursor-pointer'
// Lifecycle glyph: a 9px dot. done/error fill it; spin makes it a ring (accent top) + spins.
const GLYPH_BASE = 'flex-none size-2.25 rounded-pw-pill'
const GLYPH: Record<ToolGlyph, string> = {
  done: 'bg-pw-success',
  error: 'bg-pw-danger',
  spin: 'border-[0.09375rem] border-t-pw-text-2 border-x-pw-line-2 border-b-pw-line-2 anim-tool-spin',
}

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
  const errored = (): boolean => toolGlyph(props.part, props.result) === 'error'
  return (
    <Collapsible.Root
      open={open()}
      onOpenChange={(details) => setOpen(details.open)}
      class={`${TOOL}  ${errored() ? ERR_BG : `${GLASS_BG} ${ACCENT_RAIL[props.accent]}`}`}
    >
      <Collapsible.Trigger class={HEAD}>
        <span class="text-pw-text-2 inline-flex flex-none size-4 items-center justify-center" aria-hidden="true">
          <Dynamic component={props.Icon} />
        </span>
        <span class="text-pw-text-hi font-medium flex-auto min-w-0 whitespace-nowrap text-ellipsis overflow-hidden">
          {props.title}
        </span>
        <span class={`${GLYPH_BASE}  ${GLYPH[toolGlyph(props.part, props.result)]}`} aria-hidden="true" />
        <Show when={meta()}>
          <span class="text-[0.6875rem] text-pw-text-3 flex-none tabular-nums">{meta()}</span>
        </Show>
        <Show when={props.children}>
          <ChevronDown
            class="text-pw-text-3 flex-none trans-tf160 [[data-state=closed]_&]:[transform:rotate(-90deg)]"
            size={14}
            aria-hidden="true"
          />
        </Show>
      </Collapsible.Trigger>
      <Show when={props.children}>
        <Collapsible.Content>
          <div class="mt-1.75">{props.children}</div>
        </Collapsible.Content>
      </Show>
    </Collapsible.Root>
  )
}
