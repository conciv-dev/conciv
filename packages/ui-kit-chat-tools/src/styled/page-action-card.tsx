import {Show, Switch, Match, For, type JSX} from 'solid-js'
import {Keyboard, MousePointerClick, ScanSearch, Wand2, Target, MoveUpRight} from 'lucide-solid'
import {SolidCodeBlock, type FileOptions} from '@conciv/solid-diffs'
import {PageInput} from '@conciv/tools/defs'
import {MUTATING_KINDS, mirrorsKind, type PageQueryKind} from '@conciv/protocol/page-types'
import {ToolCard, parseInput, resultText, parseResultPayload} from '@conciv/ui-kit-chat'
import type {ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {formatHtml} from '../page-format.js'

const CODE_OPTIONS: FileOptions<undefined> = {theme: {light: 'github-light', dark: 'github-dark'}, themeType: 'system'}
const OUT_OPTIONS: FileOptions<undefined> = {
  theme: {light: 'github-light', dark: 'github-dark'},
  themeType: 'system',
  disableFileHeader: true,
  disableLineNumbers: true,
}
const OUT_CLASS =
  'block w-full max-h-[13.75rem] overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'

function readInput(part: ToolCallPart): ReturnType<typeof parseInput<typeof PageInput>> {
  return parseInput(PageInput, part)
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

type TitleContext = {
  at: string
  value: string | undefined
  key: string | undefined
}

function changedAttributeTitle(ctx: TitleContext): string {
  return `Changed an attribute${ctx.at}`
}

function changedClassTitle(ctx: TitleContext): string {
  return `Changed a class${ctx.at}`
}

const TITLES: Record<PageQueryKind, (ctx: TitleContext) => string> = {
  click: (ctx) => `Clicked${ctx.at || ' element'}`,
  fill: (ctx) => (ctx.value ? `Typed "${ctx.value}" into${ctx.at || ' field'}` : `Filled${ctx.at || ' field'}`),
  select: (ctx) => (ctx.value ? `Selected "${ctx.value}"` : `Selected an option${ctx.at}`),
  check: (ctx) => `Checked${ctx.at || ' box'}`,
  uncheck: (ctx) => `Unchecked${ctx.at || ' box'}`,
  press: (ctx) => `Pressed ${ctx.key ?? 'a key'}`,
  hover: (ctx) => `Hovered${ctx.at || ' element'}`,
  scroll: () => 'Scrolled the page',
  submit: (ctx) => `Submitted${ctx.at || ' the form'}`,
  find: (ctx) => `Found${ctx.at || ' elements'}`,
  locate: (ctx) => `Located${ctx.at || ' element'}`,
  inspect: (ctx) => `Inspected${ctx.at || ' element'}`,
  tree: () => 'Read the page tree',
  dom: (ctx) => `Read the DOM${ctx.at}`,
  snapshot: () => 'Captured a snapshot',
  text: (ctx) => `Read the text${ctx.at}`,
  value: (ctx) => `Read a value${ctx.at}`,
  attr: (ctx) => `Read an attribute${ctx.at}`,
  exists: (ctx) => `Checked if${ctx.at || ' an element'} exists`,
  query: (ctx) => `Queried${ctx.at || ' the page'}`,
  console: () => 'Read the console',
  route: () => 'Read the route',
  track: () => 'Tracked changes',
  wait: (ctx) => `Waited for${ctx.at || ' the page'}`,
  override: (ctx) => `Overrode${ctx.at || ' a value'}`,
  setattr: changedAttributeTitle,
  removeattr: changedAttributeTitle,
  addclass: changedClassTitle,
  removeclass: changedClassTitle,
  setstyle: (ctx) => `Styled${ctx.at || ' an element'}`,
  settext: (ctx) => `Set text${ctx.at}`,
  sethtml: (ctx) => `Set HTML${ctx.at}`,
  remove: (ctx) => `Removed${ctx.at || ' an element'}`,
  insert: (ctx) => `Inserted${ctx.at || ' content'}`,
  css: () => 'Injected CSS',
  eval: () => 'Ran a script on the page',
  effect: (ctx) => `effect${ctx.at}`,
  ext: (ctx) => `ext${ctx.at}`,
}

function pageTitle(part: ToolCallPart): string {
  const input = readInput(part)
  if (input?.verb === undefined) return 'Page action'
  const targetEl = target(input)
  const at = targetEl ? ` ${targetEl}` : ''
  const value = input?.value || input?.text
  return TITLES[input.verb]({at, value, key: input?.key})
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
    <Switch
      fallback={
        <SolidCodeBlock
          class={OUT_CLASS}
          options={OUT_OPTIONS}
          file={{name: 'result.txt', lang: 'text', contents: pretty()}}
        />
      }
    >
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
        <SolidCodeBlock
          class={OUT_CLASS}
          options={OUT_OPTIONS}
          file={{name: 'result.txt', lang: 'text', contents: text() ?? ''}}
        />
      </Match>
      <Match when={value() !== undefined}>
        <code class={ELCHIP}>{value()}</code>
      </Match>
    </Switch>
  )
}

export function PageActionCard(props: ToolCardProps): JSX.Element {
  const input = () => readInput(props.part)
  const verb = () => input()?.verb
  const targetEl = () => target(input())
  const payload = () => parseResultPayload(props.result)

  const failureText = (): string | undefined => {
    const direct = props.result?.error ?? asString(payload())
    return direct ?? resultText(props.result)
  }
  const errorMessage = (): string | undefined =>
    props.result?.state === 'error' ? failureText() : asString(asRecord(payload())?.error)
  const evalCode = () => (verb() === 'eval' ? input()?.code : undefined)
  const showResult = () => (isRead(verb()) || verb() === 'eval') && resultText(props.result).length > 0
  const showMirror = () => {
    const value = verb()
    return value !== undefined && mirrorsKind(value)
  }
  return (
    <ToolCard Icon={() => VerbIcon(verb())} title={pageTitle(props.part)} part={props.part} result={props.result}>
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
            <Show when={evalCode()}>
              {(code) => (
                <SolidCodeBlock
                  class={OUT_CLASS}
                  options={OUT_OPTIONS}
                  file={{name: 'script.ts', lang: 'ts', contents: code()}}
                />
              )}
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
