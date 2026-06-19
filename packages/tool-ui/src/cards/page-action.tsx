import {Show, Switch, Match, For, type JSX} from 'solid-js'
import {Keyboard, MousePointerClick, ScanSearch, Wand2, Target, MoveUpRight} from 'lucide-solid'
import {SolidCodeBlock} from '@mandarax/solid-diffs'
import {PageInput} from '@mandarax/tools/defs'
import {MUTATING_KINDS, mirrorsKind, type PageQueryKind} from '@mandarax/protocol/page-types'
import {ToolCard} from '../shell.js'
import {parseInput, resultText, parseResultPayload, formatHtml} from '../util.js'
import {CODE_OPTIONS} from '../diff-options.js'
import type {ToolCardProps} from '../types.js'

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
    <Switch fallback={<pre class="pw-page-out">{pretty()}</pre>}>
      <Match when={nodes()}>
        {(ns) => (
          <ul class="pw-snap">
            <For each={ns()}>
              {(n) => (
                <li class="pw-snap-row">
                  <Show when={n.role}>
                    <span class="pw-snap-role">{n.role}</span>
                  </Show>
                  <Show when={n.name}>
                    <span class="pw-snap-name">{n.name}</span>
                  </Show>
                  <Show when={n.ref}>
                    <span class="pw-snap-ref">{n.ref}</span>
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
            class="pw-read-code"
            options={CODE_OPTIONS}
            file={{name: 'page.html', contents: formatHtml(h())}}
          />
        )}
      </Match>
      <Match when={text() !== undefined}>
        <pre class="pw-page-out">{text()}</pre>
      </Match>
      <Match when={value() !== undefined}>
        <code class="pw-elchip">{value()}</code>
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
              <span class="pw-elchip">
                <Target size={12} aria-hidden="true" />
                <span class="pw-elchip-target">{t()}</span>
              </span>
            </Show>
            <Show when={showMirror()}>
              <div class="pw-mirror">
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
        <div class="pw-tool-error">{errorMessage()}</div>
      </Show>
    </ToolCard>
  )
}
