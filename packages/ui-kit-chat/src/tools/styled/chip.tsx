import {Show, splitProps, type JSX} from 'solid-js'
import {cva} from 'class-variance-authority'
import {CLIP_REVEAL, createClipReveal, revealTriggerProps, Tooltip} from '@conciv/ui-kit-system'

const chip = cva(
  'inline-flex min-w-0 items-center gap-1.25 overflow-hidden text-ellipsis whitespace-nowrap leading-none rounded-[var(--chat-radius-pill)] [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)]',
  {
    variants: {
      maxWidth: {
        full: 'max-w-full',
        compact: 'max-w-40',
      },
      kind: {
        field: 'px-2.25 pt-1.25 pb-1',
        pill: 'px-2 pt-1.25 pb-1',
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
    defaultVariants: {kind: 'field', tone: 'neutral', maxWidth: 'full'},
  },
)

export const CHIP = chip({kind: 'field', tone: 'neutral', maxWidth: 'full'})

const FIELD_KEY = 'text-chat-text-3 m-0'
const FIELD_VALUE = 'whitespace-nowrap text-ellipsis overflow-hidden [color:var(--chat-text)] m-0'
const PILL_VALUE = 'min-w-0 overflow-hidden text-ellipsis whitespace-nowrap'
const ROW = 'm-0 p-0 flex flex-wrap gap-1.5'

function fieldTermContent(name: string | undefined, value: string, valueRef: (node: HTMLElement) => void): JSX.Element {
  return (
    <>
      <dt class={FIELD_KEY}>{name}</dt>
      <dd ref={valueRef} class={FIELD_VALUE}>
        {value}
      </dd>
    </>
  )
}

function fieldSpanContent(name: string | undefined, value: string, valueRef: (node: HTMLElement) => void): JSX.Element {
  return (
    <>
      <span class={FIELD_KEY}>{name}</span>
      <span ref={valueRef} class={FIELD_VALUE}>
        {value}
      </span>
    </>
  )
}

function chipContent(
  kind: 'field' | 'pill',
  name: string | undefined,
  value: string,
  valueRef: (node: HTMLElement) => void,
): JSX.Element {
  if (kind === 'pill')
    return (
      <span ref={valueRef} class={PILL_VALUE}>
        {value}
      </span>
    )
  return fieldTermContent(name, value, valueRef)
}

function triggerContent(
  kind: 'field' | 'pill',
  name: string | undefined,
  value: string,
  valueRef: (node: HTMLElement) => void,
): JSX.Element {
  if (kind === 'pill') return chipContent(kind, name, value, valueRef)
  return fieldSpanContent(name, value, valueRef)
}

export function Chip(props: {
  name?: string
  value: string
  kind?: 'field' | 'pill'
  tone?: 'neutral' | 'accent' | 'success' | 'danger'
  maxWidth?: 'full' | 'compact'
  tooltip?: string
  class?: string
}): JSX.Element {
  const [local] = splitProps(props, ['name', 'value', 'kind', 'tone', 'maxWidth', 'tooltip', 'class'])
  const reveal = createClipReveal()
  const kind = (): 'field' | 'pill' => local.kind ?? 'field'
  const chipClass = (): string =>
    `${chip({kind: kind(), tone: local.tone ?? 'neutral', maxWidth: local.maxWidth ?? 'full'})} ${local.class ?? ''}`
  const showsContent = (): boolean => reveal.clipped() || local.tooltip !== undefined

  return (
    <Tooltip.Root onOpenChange={reveal.onOpenChange} lazyMount unmountOnExit>
      <Show
        when={local.tooltip !== undefined}
        fallback={
          <Tooltip.Trigger
            asChild={(triggerProps) => (
              <div {...revealTriggerProps(reveal, triggerProps())} class={chipClass()}>
                {chipContent(kind(), local.name, local.value, reveal.ref)}
              </div>
            )}
          />
        }
      >
        <div class="contents">
          <Tooltip.Trigger type="button" class={chipClass()}>
            {triggerContent(kind(), local.name, local.value, reveal.ref)}
          </Tooltip.Trigger>
        </div>
      </Show>
      <Show when={showsContent()}>
        <Tooltip.Positioner>
          <Tooltip.Content class={reveal.clipped() ? CLIP_REVEAL : undefined}>
            <Show when={reveal.clipped()}>
              <span class="block">{local.value}</span>
            </Show>
            <Show when={local.tooltip}>{(tooltip) => <span class="block">{tooltip()}</span>}</Show>
          </Tooltip.Content>
        </Tooltip.Positioner>
      </Show>
    </Tooltip.Root>
  )
}

export function ChipRow(props: {class?: string; children: JSX.Element}): JSX.Element {
  const [local] = splitProps(props, ['class', 'children'])
  const rowClass = (): string => `${ROW} ${local.class ?? ''}`
  return <dl class={rowClass()}>{local.children}</dl>
}

export function ChipGroup(props: {class?: string; children: JSX.Element}): JSX.Element {
  const [local] = splitProps(props, ['class', 'children'])
  const rowClass = (): string => `${ROW} ${local.class ?? ''}`
  return <div class={rowClass()}>{local.children}</div>
}
