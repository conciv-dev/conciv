import {Show, Switch, Match, For, type JSX} from 'solid-js'
import {Keyboard, MousePointerClick, ScanSearch, Wand2, Target, MoveUpRight} from 'lucide-solid'
import {SolidCodeBlock} from '@mandarax/solid-diffs'
import {PageInput} from '@mandarax/tools/defs'
import {MUTATING_KINDS, mirrorsKind, type PageQueryKind} from '@mandarax/protocol/page-types'
import {ToolCard} from '../shell.js'
import {parseInput, resultText, parseResultPayload, formatHtml} from '../util.js'
import {CODE_OPTIONS} from '../diff-options.js'
import type {ToolCardProps} from '../types.js'
import {cardTool} from '../card-tool.js'

function readInput(props: ToolCardProps): ReturnType<typeof parseInput<typeof PageInput>> {
  return parseInput(PageInput, props.part)
}

// The element a page verb targets, in priority order.
function target(input: ReturnType<typeof readInput>): string | undefined {
  return input?.selector || input?.name || input?.ref || undefined
}

const MUTATES = new Set<PageQueryKind>(MUTATING_KINDS)
function isRead(verb: PageQueryKind | undefined): boolean {
  return verb !== undefined && !MUTATES.has(verb)
}

// Per-verb icon, mirroring the mockup's distinct glyphs: keyboard for typing, pointer for clicks,
// scan for reads, wand for DOM edits.
const TYPE_VERBS = new Set<PageQueryKind>(['fill', 'press'])
const POINTER_VERBS = new Set<PageQueryKind>(['click', 'hover', 'check', 'uncheck', 'select', 'submit', 'scroll'])
function VerbIcon(verb: PageQueryKind | undefined): JSX.Element {
  if (verb && TYPE_VERBS.has(verb)) return <Keyboard size={14} />
  if (verb && POINTER_VERBS.has(verb)) return <MousePointerClick size={14} />
  if (isRead(verb)) return <ScanSearch size={14} />
  return <Wand2 size={14} />
}

// Human label for a page verb — never the raw verb. Bold value / dim qualifier handled by the caller
// via the "value" + "at" fragments the title carries inline.
function pageTitle(props: ToolCardProps): string {
  const input = readInput(props)
  const t = target(input)
  const at = t ? ` ${t}` : ''
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

// A snapshot/tree node, as buildSnapshot emits it (all fields best-effort).
type SnapNode = {ref?: string; role?: string; name?: string; value?: string; state?: string[]}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined
}
function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined
}
function asNodes(v: unknown): SnapNode[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.filter((n): n is SnapNode => typeof n === 'object' && n !== null)
}

// Element chip (mono pill) + a scrollable mono <pre> for raw read output — both reused below.
const ELCHIP =
  'inline-flex items-center gap-1.25 max-w-full min-w-0 font-pw-mono text-[0.71875rem] text-pw-accent-link bg-pw-accent-08 border border-pw-accent-line rounded-pw-pill py-0.5 px-2.25'
const PAGE_OUT =
  'm-0 w-full max-h-[13.75rem] overflow-auto font-pw-mono text-[0.6875rem] text-pw-text-2 bg-pw-sunken border border-pw-line-soft rounded-pw-sm py-2 px-2.5 whitespace-pre'

// Readable per-shape render of a page read result (already unwrapped + JSON-parsed by the harness +
// parseResultPayload): an accessibility-node list, a DOM code block, plain text/value, else the
// payload pretty-printed. Never the raw escaped MCP envelope.
function PageResultView(props: {payload: unknown; raw: string}): JSX.Element {
  const rec = () => asRecord(props.payload)
  const nodes = () => asNodes(rec()?.nodes)
  const html = () => asString(rec()?.html)
  const text = () => asString(rec()?.text)
  const value = () => {
    const v = rec()?.value
    return v === undefined ? undefined : String(v)
  }
  const pretty = () => (props.payload === undefined ? props.raw : JSON.stringify(props.payload, null, 2))
  return (
    <Switch fallback={<pre class={PAGE_OUT}>{pretty()}</pre>}>
      <Match when={nodes()}>
        {(ns) => (
          <ul class="m-0 p-0 list-none border border-pw-line-soft rounded-pw-sm bg-pw-sunken max-h-[13.75rem] w-full overflow-auto">
            <For each={ns()}>
              {(n) => (
                <li class="text-[0.71875rem] px-2.5 py-1 flex gap-2 items-baseline [&:not(:first-child)]:border-t [&:not(:first-child)]:border-t-pw-line-soft">
                  <Show when={n.role}>
                    <span class="text-[0.65625rem] text-pw-accent-link font-pw-mono flex-none">{n.role}</span>
                  </Show>
                  <Show when={n.name}>
                    <span class="text-pw-text flex-1 min-w-0 whitespace-nowrap text-ellipsis overflow-hidden">
                      {n.name}
                    </span>
                  </Show>
                  <Show when={n.ref}>
                    <span class="text-[0.625rem] text-pw-text-3 font-pw-mono flex-none">{n.ref}</span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        )}
      </Match>
      <Match when={html()}>
        {(h) => (
          <SolidCodeBlock
            class="text-[0.75rem] rounded-pw-sm bg-pw-sunken max-h-[20rem] max-w-full block overflow-auto"
            options={CODE_OPTIONS}
            file={{name: 'page.html', contents: formatHtml(h())}}
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
  const t = () => target(input())
  const payload = () => parseResultPayload(props.result)
  // An error can arrive two ways: a real error result, or a 'complete' result whose payload is
  // {error: "..."} (a handler that returned err() without is_error). Surface both as the message.
  const errorMessage = (): string | undefined => {
    if (props.result?.state === 'error') return props.result.error ?? resultText(props.result)
    return asString(asRecord(payload())?.error)
  }
  // Reads surface their result; actions stay compact with an element chip + the "shown on your page"
  // mirror note — the split the mockups draw.
  const showResult = () => isRead(verb()) && resultText(props.result).length > 0
  const showMirror = () => {
    const v = verb()
    return v !== undefined && mirrorsKind(v)
  }
  return (
    <ToolCard
      accent="page"
      Icon={() => VerbIcon(verb())}
      title={pageTitle(props)}
      part={props.part}
      result={props.result}
      durationMs={props.durationMs}
    >
      <Show
        when={errorMessage()}
        fallback={
          <>
            <Show when={t()}>
              <span class={ELCHIP}>
                <Target size={12} aria-hidden="true" />
                <span class="whitespace-nowrap text-ellipsis overflow-hidden">{t()}</span>
              </span>
            </Show>
            <Show when={showMirror()}>
              <div class="text-[0.6875rem] text-pw-accent-link flex gap-1.5 items-center">
                <MoveUpRight size={12} aria-hidden="true" />
                <span>shown on your page</span>
              </div>
            </Show>
            <Show when={showResult()}>
              <PageResultView payload={payload()} raw={resultText(props.result)} />
            </Show>
          </>
        }
      >
        <div class="text-[0.75rem] text-pw-danger font-pw-mono whitespace-pre-wrap">{errorMessage()}</div>
      </Show>
    </ToolCard>
  )
}

export const pageActionTool = cardTool({
  name: 'mandarax_page',
  label: 'Page',
  parameters: PageInput,
  Card: PageActionCard,
})
