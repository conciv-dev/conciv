import {Show, Switch, Match, For, type JSX} from 'solid-js'
import {Keyboard, MousePointerClick, ScanSearch, Wand2, Target, MoveUpRight} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import {PageInput} from '@conciv/tools/defs'
import {MUTATING_KINDS, mirrorsKind, type PageQueryKind} from '@conciv/protocol/page-types'
import {ToolCard, parseInput, resultText, parseResultPayload} from '@conciv/ui-kit-chat'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {formatHtml} from '../page-format.js'

const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}

function readInput(props: ToolCardProps): ReturnType<typeof parseInput<typeof PageInput>> {
  return parseInput(PageInput, props.part)
}

function target(input: ReturnType<typeof readInput>): string | undefined {
  return input?.selector || input?.name || input?.ref || undefined
}

const MUTATES = new Set<PageQueryKind>(MUTATING_KINDS)
function isRead(verb: PageQueryKind | undefined): boolean {
  return verb !== undefined && !MUTATES.has(verb)
}

const TYPE_VERBS = new Set<PageQueryKind>(['fill', 'press'])
const POINTER_VERBS = new Set<PageQueryKind>(['click', 'hover', 'check', 'uncheck', 'select', 'submit', 'scroll'])
function VerbIcon(verb: PageQueryKind | undefined): JSX.Element {
  if (verb && TYPE_VERBS.has(verb)) return <Keyboard size={14} />
  if (verb && POINTER_VERBS.has(verb)) return <MousePointerClick size={14} />
  if (isRead(verb)) return <ScanSearch size={14} />
  return <Wand2 size={14} />
}

function pageTitle(props: ToolCardProps): string {
  const input = readInput(props)
  const targetEl = target(input)
  const at = targetEl ? ` ${targetEl}` : ''
  const value = input?.value || input?.text
  switch (input?.verb) {
    case 'click':
      return `Clicked${at || ' element'}`
    case 'fill':
      return value ? `Typed "${value}" into${at || ' field'}` : `Filled${at || ' field'}`
    case 'select':
      return value ? `Selected "${value}"` : `Selected an option${at}`
    case 'check':
      return `Checked${at || ' box'}`
    case 'uncheck':
      return `Unchecked${at || ' box'}`
    case 'press':
      return `Pressed ${input?.key ?? 'a key'}`
    case 'hover':
      return `Hovered${at || ' element'}`
    case 'scroll':
      return 'Scrolled the page'
    case 'submit':
      return `Submitted${at || ' the form'}`
    case 'find':
      return `Found${at || ' elements'}`
    case 'locate':
      return `Located${at || ' element'}`
    case 'inspect':
      return `Inspected${at || ' element'}`
    case 'tree':
      return 'Read the page tree'
    case 'dom':
      return `Read the DOM${at}`
    case 'snapshot':
      return 'Captured a snapshot'
    case 'text':
      return `Read the text${at}`
    case 'value':
      return `Read a value${at}`
    case 'attr':
      return `Read an attribute${at}`
    case 'exists':
      return `Checked if${at || ' an element'} exists`
    case 'query':
      return `Queried${at || ' the page'}`
    case 'console':
      return 'Read the console'
    case 'route':
      return 'Read the route'
    case 'track':
      return 'Tracked changes'
    case 'wait':
      return `Waited for${at || ' the page'}`
    case 'override':
      return `Overrode${at || ' a value'}`
    case 'setattr':
    case 'removeattr':
      return `Changed an attribute${at}`
    case 'addclass':
    case 'removeclass':
      return `Changed a class${at}`
    case 'setstyle':
      return `Styled${at || ' an element'}`
    case 'settext':
      return `Set text${at}`
    case 'sethtml':
      return `Set HTML${at}`
    case 'remove':
      return `Removed${at || ' an element'}`
    case 'insert':
      return `Inserted${at || ' content'}`
    case 'css':
      return 'Injected CSS'
    case 'eval':
      return 'Ran a script on the page'
    case undefined:
      return 'Page action'
    default:
      return `${input?.verb}${at}`
  }
}

type SnapNode = {ref?: string; role?: string; name?: string; value?: string; state?: string[]}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}
function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
function asNodes(value: unknown): SnapNode[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.filter((node): node is SnapNode => typeof node === 'object' && node !== null)
}

const ELCHIP =
  'inline-flex items-center gap-1.25 max-w-full min-w-0 [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-accent-link)] [background:color-mix(in_oklch,var(--chat-accent)_10%,transparent)] [border:1px_solid_color-mix(in_oklch,var(--chat-accent)_42%,transparent)] rounded-[var(--chat-radius-pill)] py-0.5 px-2.25'
const PAGE_OUT =
  'm-0 w-full max-h-[13.75rem] overflow-auto [font-family:var(--chat-mono)] text-[length:var(--chat-text-xs)] [color:var(--chat-text-2)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] rounded-[var(--chat-radius-sm)] py-2 px-2.5 whitespace-pre'

function PageResultView(props: {payload: unknown; raw: string}): JSX.Element {
  const record = () => asRecord(props.payload)
  const nodes = () => asNodes(record()?.nodes)
  const html = () => asString(record()?.html)
  const text = () => asString(record()?.text)
  const value = () => {
    const raw = record()?.value
    return raw === undefined ? undefined : String(raw)
  }
  const pretty = () => (props.payload === undefined ? props.raw : JSON.stringify(props.payload, null, 2))
  return (
    <Switch fallback={<pre class={PAGE_OUT}>{pretty()}</pre>}>
      <Match when={nodes()}>
        {(list) => (
          <ul class="m-0 p-0 list-none rounded-[var(--chat-radius-sm)] max-h-[13.75rem] w-full [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)] overflow-auto">
            <For each={list()}>
              {(node) => (
                <li class="text-[length:var(--chat-text-xs)] px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:[border-top:1px_solid_var(--chat-line-soft)]">
                  <Show when={node.role}>
                    <span class="text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-accent-link)] [font-family:var(--chat-mono)]">
                      {node.role}
                    </span>
                  </Show>
                  <Show when={node.name}>
                    <span class="flex-1 min-w-0 whitespace-nowrap text-ellipsis [color:var(--chat-text)] overflow-hidden">
                      {node.name}
                    </span>
                  </Show>
                  <Show when={node.ref}>
                    <span class="text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-text-3)] [font-family:var(--chat-mono)]">
                      {node.ref}
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
      <Match when={html()}>
        {(markup) => (
          <SolidCodeBlock
            class="text-[length:var(--chat-text-sm)] rounded-[var(--chat-radius-sm)] max-h-80 max-w-full block [background:var(--chat-sunken)] overflow-auto"
            options={CODE_OPTIONS}
            file={{name: 'page.html', contents: formatHtml(markup())}}
          />
        )}
      </Match>
      <Match when={text() !== undefined}>
        <pre class={PAGE_OUT}>{text()}</pre>
      </Match>
      <Match when={value() !== undefined}>
        <code class={ELCHIP}>{value()}</code>
      </Match>
    </Switch>
  )
}

export function PageActionCard(props: ToolCardProps): JSX.Element {
  const input = () => readInput(props)
  const verb = () => input()?.verb
  const targetEl = () => target(input())
  const payload = () => parseResultPayload(props.result)

  const errorMessage = (): string | undefined => {
    if (props.result?.state === 'error') return props.result.error ?? asString(payload()) ?? resultText(props.result)
    return asString(asRecord(payload())?.error)
  }
  const showResult = () => isRead(verb()) && resultText(props.result).length > 0
  const showMirror = () => {
    const value = verb()
    return value !== undefined && mirrorsKind(value)
  }
  return (
    <ToolCard Icon={() => VerbIcon(verb())} title={pageTitle(props)} part={props.part} result={props.result}>
      <Show
        when={errorMessage()}
        fallback={
          <div class="flex flex-col gap-1.5">
            <Show when={targetEl()}>
              <span class={ELCHIP}>
                <Target size={12} aria-hidden="true" />
                <span class="whitespace-nowrap text-ellipsis overflow-hidden">{targetEl()}</span>
              </span>
            </Show>
            <Show when={showMirror()}>
              <div class="text-[length:var(--chat-text-xs)] flex gap-1.5 [color:var(--chat-accent-link)] items-center">
                <MoveUpRight size={12} aria-hidden="true" />
                <span>shown on your page</span>
              </div>
            </Show>
            <Show when={showResult()}>
              <PageResultView payload={payload()} raw={resultText(props.result)} />
            </Show>
          </div>
        }
      >
        <div class="text-[length:var(--chat-text-sm)] whitespace-pre-wrap [color:var(--chat-danger)] [font-family:var(--chat-mono)]">
          {errorMessage()}
        </div>
      </Show>
    </ToolCard>
  )
}

export const pageActionTool: ToolCardEntry = {names: ['conciv_page'], render: PageActionCard}
