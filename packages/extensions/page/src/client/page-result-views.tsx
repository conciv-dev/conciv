import {For, Show, type JSX} from 'solid-js'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import {formatHtml} from './page-format.js'

const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}

const HTML_CLASS =
  'text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] max-h-80 max-w-full block [background:var(--chat-sunken)] overflow-auto'
const LIST =
  'm-0 p-0 list-none rounded-[var(--chat-radius-sm)] max-h-[13.75rem] w-full [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto'
const LIST_ITEM =
  'text-[length:var(--chat-text-xs)] px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]'
const ROLE =
  'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-accent-link)] [font-family:var(--chat-mono)]'
const NAME = 'flex-1 min-w-0 whitespace-nowrap text-ellipsis [color:var(--chat-text)] overflow-hidden'
const REF = 'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-text-3)] [font-family:var(--chat-mono)]'
const PAGE_VALUE_CHIP =
  'inline-flex items-center gap-1.25 max-w-full min-w-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-accent-link)] [background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] rounded-[var(--chat-radius-pill)] py-0.5 px-2.25'

export type A11yNode = {ref?: string; role?: string; name?: string; value?: string; state?: string[]}

export function A11yNodeList(props: {nodes: readonly A11yNode[]}): JSX.Element {
  return (
    <ul class={LIST}>
      <For each={props.nodes}>
        {(node) => (
          <li class={LIST_ITEM}>
            <Show when={node.role}>
              <span class={ROLE}>{node.role}</span>
            </Show>
            <Show when={node.name}>
              <span class={NAME}>{node.name}</span>
            </Show>
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
    <SolidCodeBlock
      class={HTML_CLASS}
      options={CODE_OPTIONS}
      file={{name: 'page.html', contents: formatHtml(props.markup)}}
    />
  )
}

export function PageValueChip(props: {value: string}): JSX.Element {
  return <code class={PAGE_VALUE_CHIP}>{props.value}</code>
}
