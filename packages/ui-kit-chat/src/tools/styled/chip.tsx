import {Show, splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {CLIP_REVEAL, createClipReveal, revealTriggerProps, Tooltip} from '@conciv/ui-kit-system'

const chip = cva(
  'inline-flex min-w-0 items-center gap-1.25 overflow-hidden text-ellipsis whitespace-nowrap leading-none text-[length:var(--chat-text-xs)]',
  {
    variants: {
      maxWidth: {
        full: 'max-w-full',
        compact: 'max-w-40',
      },
      kind: {
        field: 'px-2.25 pt-1.25 pb-1',
        pill: '',
      },
      size: {
        regular: 'rounded-[var(--chat-radius-pill)] [font-family:var(--chat-mono)]',
        compact: 'rounded-[var(--chat-radius-chip)] [font-family:var(--chat-font)] font-semibold',
      },
      tone: {
        neutral: '',
        accent: '',
        success: '',
        danger: '',
      },
    },
    compoundVariants: [
      {kind: 'pill', size: 'regular', class: 'px-2 pt-1.25 pb-1'},
      {kind: 'pill', size: 'compact', class: 'px-2 py-0.5'},
      {
        kind: 'field',
        tone: 'neutral',
        class:
          '[background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] [color:var(--chat-accent-link)]',
      },
      {
        kind: 'field',
        tone: 'accent',
        class:
          '[background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] [color:var(--chat-accent-link)]',
      },
      {
        kind: 'field',
        tone: 'success',
        class:
          '[background:color-mix(in_oklch,var(--chat-success)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-success)_42%,transparent)] [color:var(--chat-success)]',
      },
      {
        kind: 'field',
        tone: 'danger',
        class:
          '[background:color-mix(in_oklch,var(--chat-danger)_10%,transparent)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)]',
      },
      {
        kind: 'pill',
        size: 'regular',
        tone: 'neutral',
        class: '[background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)]',
      },
      {
        kind: 'pill',
        size: 'regular',
        tone: 'accent',
        class:
          '[background:var(--chat-sunken)] [border:1px_solid_color-mix(in_srgb,var(--chat-accent)_45%,transparent)] [color:var(--chat-accent)]',
      },
      {
        kind: 'pill',
        size: 'regular',
        tone: 'success',
        class:
          '[background:var(--chat-sunken)] [border:1px_solid_color-mix(in_srgb,var(--chat-success)_45%,transparent)] [color:var(--chat-success)]',
      },
      {
        kind: 'pill',
        size: 'regular',
        tone: 'danger',
        class: '[background:var(--chat-sunken)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)]',
      },
      {
        kind: 'pill',
        size: 'compact',
        tone: 'neutral',
        class: '[background:var(--chat-fill)] [color:var(--chat-text-2)]',
      },
      {
        kind: 'pill',
        size: 'compact',
        tone: 'accent',
        class: '[background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [color:var(--chat-accent)]',
      },
      {
        kind: 'pill',
        size: 'compact',
        tone: 'success',
        class: '[background:color-mix(in_oklch,var(--chat-success)_10%,transparent)] [color:var(--chat-success)]',
      },
      {
        kind: 'pill',
        size: 'compact',
        tone: 'danger',
        class: '[background:color-mix(in_oklch,var(--chat-danger)_10%,transparent)] [color:var(--chat-danger)]',
      },
    ],
    defaultVariants: {kind: 'field', tone: 'neutral', maxWidth: 'full', size: 'regular'},
  },
)

export const CHIP = chip({kind: 'field', tone: 'neutral', maxWidth: 'full', size: 'regular'})

const FIELD_KEY = 'text-chat-text-3 m-0'
const FIELD_VALUE = 'whitespace-nowrap text-ellipsis overflow-hidden [color:var(--chat-text)] m-0'
const ROW = 'm-0 p-0 flex flex-wrap gap-1.5'

function fieldTermContent(name: string | undefined, value: string): JSX.Element {
  return (
    <>
      <dt class={FIELD_KEY}>{name}</dt>
      <dd class={FIELD_VALUE}>{value}</dd>
    </>
  )
}

function fieldSpanContent(name: string | undefined, value: string): JSX.Element {
  return (
    <>
      <span class={FIELD_KEY}>{name}</span>
      <span class={FIELD_VALUE}>{value}</span>
    </>
  )
}

function chipContent(kind: 'field' | 'pill', name: string | undefined, value: string): JSX.Element {
  if (kind === 'pill') return value
  return fieldTermContent(name, value)
}

function triggerContent(kind: 'field' | 'pill', name: string | undefined, value: string): JSX.Element {
  if (kind === 'pill') return value
  return fieldSpanContent(name, value)
}

function ClippedChip(props: {value: string; content: JSX.Element; class: string}): JSX.Element {
  const [local, rest] = splitProps(props, ['value', 'content', 'class'])
  const reveal = createClipReveal()
  return (
    <Tooltip.Root onOpenChange={reveal.onOpenChange} lazyMount unmountOnExit>
      <Tooltip.Trigger
        asChild={(triggerProps) => (
          <div {...rest} {...revealTriggerProps(reveal, triggerProps())} ref={reveal.ref} class={local.class}>
            {local.content}
          </div>
        )}
      />
      <Show when={reveal.clipped()}>
        <Tooltip.Positioner>
          <Tooltip.Content class={CLIP_REVEAL}>{local.value}</Tooltip.Content>
        </Tooltip.Positioner>
      </Show>
    </Tooltip.Root>
  )
}

export function Chip(props: {
  name?: string
  value: string
  kind?: 'field' | 'pill'
  tone?: 'neutral' | 'accent' | 'success' | 'danger'
  maxWidth?: 'full' | 'compact'
  size?: 'regular' | 'compact'
  tooltip?: string
  class?: string
}): JSX.Element {
  const [local, rest] = splitProps(props, ['name', 'value', 'kind', 'tone', 'maxWidth', 'size', 'tooltip', 'class'])
  const kind = (): 'field' | 'pill' => local.kind ?? 'field'
  const chipClass = (): string =>
    `${chip({kind: kind(), tone: local.tone ?? 'neutral', maxWidth: local.maxWidth ?? 'full', size: local.size ?? 'regular'})} ${local.class ?? ''}`

  return (
    <Show
      when={local.tooltip}
      fallback={
        <ClippedChip
          {...rest}
          value={local.value}
          content={chipContent(kind(), local.name, local.value)}
          class={chipClass()}
        />
      }
    >
      {(tooltip) => (
        <div class="contents">
          <Tooltip.Root unmountOnExit lazyMount>
            <Tooltip.Trigger {...rest} type="button" class={chipClass()}>
              {triggerContent(kind(), local.name, local.value)}
            </Tooltip.Trigger>
            <Tooltip.Positioner>
              <Tooltip.Content>{tooltip()}</Tooltip.Content>
            </Tooltip.Positioner>
          </Tooltip.Root>
        </div>
      )}
    </Show>
  )
}

export function ChipRow(props: {class?: string; children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  const rowClass = (): string => `${ROW} ${local.class ?? ''}`
  return (
    <dl {...rest} class={rowClass()}>
      {local.children}
    </dl>
  )
}

export function ChipGroup(props: {class?: string; children: JSX.Element}): JSX.Element {
  const [local, rest] = splitProps(props, ['class', 'children'])
  const rowClass = (): string => `${ROW} ${local.class ?? ''}`
  return (
    <div {...rest} class={rowClass()}>
      {local.children}
    </div>
  )
}
