import {For, Show, type JSX} from 'solid-js'
import {TruncatedText} from '@conciv/ui-kit-system'
import type {buildSnapshot} from '@conciv/page'
import {Chip, CodeBlock, SUNKEN_SURFACE} from '@conciv/ui-kit-chat/tools'
import {LIST_ROW_CLASS} from './shared.js'
import {formatHtml} from './page-format.js'

const HTML_CLASS = 'max-w-full'
const LIST = `m-0 p-0 list-none max-h-[13.75rem] w-full ${SUNKEN_SURFACE} overflow-auto`
const LIST_ITEM = `text-[length:var(--chat-text-xs)] ${LIST_ROW_CLASS}`
const ROLE =
  'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-accent-link)] [font-family:var(--chat-mono)]'
const NAME = 'flex-1 min-w-0 whitespace-nowrap text-ellipsis [color:var(--chat-text)] overflow-hidden'
const REF = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-3 [font-family:var(--chat-mono)]'

export type A11yNode = Partial<ReturnType<typeof buildSnapshot>[number]>

export function A11yNodeList(props: {nodes: readonly A11yNode[]}): JSX.Element {
  return (
    <ul class={LIST}>
      <For each={props.nodes}>
        {(node) => (
          <li class={LIST_ITEM}>
            <Show when={node.role}>
              <span class={ROLE}>{node.role}</span>
            </Show>
            <Show when={node.name}>{(name) => <TruncatedText class={NAME} text={name()} />}</Show>
            <Show when={node.ref}>
              <span class={REF}>{node.ref}</span>
            </Show>
          </li>
        )}
      </For>
    </ul>
  )
}

export function PageHtmlBlock(props: {markup: string}): JSX.Element {
  return (
    <CodeBlock
      class={HTML_CLASS}
      maxHeight="log"
      chrome="file"
      file={{name: 'page.html', lang: 'html', contents: formatHtml(props.markup)}}
    />
  )
}

export function PageValueChip(props: {value: string}): JSX.Element {
  return <Chip kind="pill" tone="accent" value={props.value} />
}
