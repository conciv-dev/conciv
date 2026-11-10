import {Show, splitProps, type JSX} from 'solid-js'
import {TruncatedText} from '@conciv/ui-kit-system'
import {StatusVisual} from '../primitives/status-visual.js'
import type {ToolStatus} from '../primitives/tool-status.js'
import type {EmbeddedCardHeader} from '../primitives/tool-row.js'
import {publishCardHeader, useEmbeddedCard} from './card-chrome.js'

const INLINE_ROW = 'text-chat-text-2 text-[length:var(--chat-text-md)] py-0.5 flex gap-2 items-center'

export function InlineShell(props: {name: string; status: ToolStatus; children?: JSX.Element}): JSX.Element {
  const [, rest] = splitProps(props, ['name', 'status', 'children'])
  const embedded = useEmbeddedCard()
  publishCardHeader((): EmbeddedCardHeader => ({title: props.name, status: props.status}))
  return (
    <div {...rest} class={INLINE_ROW}>
      <Show when={!embedded()}>
        <StatusVisual status={props.status} form="icon" />
      </Show>
      <span class="flex gap-1.5 min-w-0 items-center">
        <Show when={!embedded()}>
          <span class="text-chat-text font-medium [font-family:var(--chat-mono)]">{props.name}</span>
        </Show>
        {props.children}
      </span>
    </div>
  )
}

export function InlineRow(props: {label: string; status: ToolStatus; value: string}): JSX.Element {
  const [, rest] = splitProps(props, ['label', 'status', 'value'])
  return (
    <InlineShell {...rest} name={props.label} status={props.status}>
      <Show when={props.value}>
        <TruncatedText class="text-chat-text-3" text={props.value} />
      </Show>
    </InlineShell>
  )
}
