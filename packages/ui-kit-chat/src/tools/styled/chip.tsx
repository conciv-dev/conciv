import {Show, splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {Tooltip} from '@conciv/ui-kit-system'

const chip = cva(
  'inline-flex max-w-full min-w-0 items-center gap-1.25 overflow-hidden text-ellipsis whitespace-nowrap rounded-[var(--chat-radius-pill)] [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)]',
  {
    variants: {
      kind: {
        field: 'py-0.5 px-2.25',
        pill: 'py-0.5 px-2',
      },
      tone: {
        neutral: '',
        accent: '',
        success: '',
        danger: '',
      },
    },
    compoundVariants: [
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
        tone: 'neutral',
        class: '[background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)]',
      },
      {
        kind: 'pill',
        tone: 'accent',
        class:
          '[background:var(--chat-sunken)] [border:1px_solid_color-mix(in_srgb,var(--chat-accent)_45%,transparent)] [color:var(--chat-accent)]',
      },
      {
        kind: 'pill',
        tone: 'success',
        class:
          '[background:var(--chat-sunken)] [border:1px_solid_color-mix(in_srgb,var(--chat-success)_45%,transparent)] [color:var(--chat-success)]',
      },
      {
        kind: 'pill',
        tone: 'danger',
        class: '[background:var(--chat-sunken)] [border:1px_solid_var(--chat-danger-line)] [color:var(--chat-danger)]',
      },
    ],
    defaultVariants: {kind: 'field', tone: 'neutral'},
  },
)

export const CHIP = chip({kind: 'field', tone: 'neutral'})

const FIELD_KEY = 'text-[color:var(--chat-text-3)] m-0'
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

export function Chip(props: {
  name?: string
  value: string
  kind?: 'field' | 'pill'
  tone?: 'neutral' | 'accent' | 'success' | 'danger'
  tooltip?: string
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['name', 'value', 'kind', 'tone', 'tooltip', 'class'])
  const kind = (): 'field' | 'pill' => local.kind ?? 'field'
  const chipClass = (): string => `${chip({kind: kind(), tone: local.tone ?? 'neutral'})} ${local.class ?? ''}`

  return (
    <Show when={local.tooltip} fallback={<div class={chipClass()}>{chipContent(kind(), local.name, local.value)}</div>}>
      {(tooltip) => (
        <div class="contents">
          <Tooltip.Root unmountOnExit lazyMount>
            <Tooltip.Trigger type="button" class={chipClass()}>
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
  const [local] = splitProps(props, ['class', 'children'])
  const rowClass = (): string => `${ROW} ${local.class ?? ''}`
  return <dl class={rowClass()}>{local.children}</dl>
}
