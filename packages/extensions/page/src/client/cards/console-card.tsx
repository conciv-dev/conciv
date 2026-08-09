import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolCardProps} from '@conciv/protocol/tool-view-types'
import {CODE_BLOCK_CLASS, DANGER_TEXT_CLASS, JsonTree} from '@conciv/ui-kit-chat/tools'
import {PageValueChip} from '../page-result-views.js'
import {CardShell, LIST_ROW_CLASS, QUIET_TEXT_CLASS, cardErrorMessage, cardHeader, cardPayload} from './shared.js'

const ConsolePayload = z.looseObject({
  entries: z.array(z.looseObject({level: z.string(), ts: z.number(), text: z.string()})),
})

const LINE_FORMAT = new Intl.NumberFormat()
const LINE_PLURAL = new Intl.PluralRules('en')
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit'})

const LIST = `${CODE_BLOCK_CLASS} m-0 p-0 list-none`
const LEVEL =
  'text-[length:var(--chat-text-xs)] flex-none w-10 uppercase [color:var(--chat-text-3)] [font-family:var(--chat-mono)]'
const TIME =
  'text-[length:var(--chat-text-xs)] flex-none [color:var(--chat-text-3)] [font-family:var(--chat-mono)] tabular-nums'
const TEXT =
  'text-[length:var(--chat-text-sm)] flex-1 min-w-0 whitespace-pre-wrap [color:var(--chat-text)] [font-family:var(--chat-mono)] [overflow-wrap:anywhere]'
const TEXT_DANGER = `${DANGER_TEXT_CLASS} flex-1 min-w-0 [overflow-wrap:anywhere]`

type ConsoleLine = {level: string; ts: number; text: string}

function linesOf(payload: unknown): readonly ConsoleLine[] | undefined {
  const parsed = ConsolePayload.safeParse(payload)
  return parsed.success ? parsed.data.entries : undefined
}

function lineLabel(count: number): string {
  return `${LINE_FORMAT.format(count)} ${LINE_PLURAL.select(count) === 'one' ? 'line' : 'lines'}`
}

function textClassOf(level: string): string {
  return level === 'error' ? TEXT_DANGER : TEXT
}

export function ConsoleCard(props: ToolCardProps): JSX.Element {
  const {meta, title} = cardHeader(props)
  const payload = () => cardPayload(props.result)
  const lines = () => linesOf(payload())
  const errorMessage = () => cardErrorMessage(props.result)
  return (
    <CardShell meta={meta()} title={title()} part={props.part} result={props.result} durationMs={props.durationMs}>
      <div class="flex flex-col gap-1.5">
        <Switch>
          <Match when={errorMessage()}>{(message) => <p class={DANGER_TEXT_CLASS}>{message()}</p>}</Match>
          <Match when={lines()}>
            {(entries) => (
              <Show
                when={entries().length > 0}
                fallback={<p class={QUIET_TEXT_CLASS}>the page logged nothing to the console</p>}
              >
                <p class="m-0">
                  <PageValueChip value={lineLabel(entries().length)} />
                </p>
                <ul class={LIST}>
                  <For each={entries()}>
                    {(entry) => (
                      <li class={LIST_ROW_CLASS}>
                        <span class={TIME}>{TIME_FORMAT.format(entry.ts)}</span>
                        <span class={LEVEL}>{entry.level}</span>
                        <span class={textClassOf(entry.level)}>{entry.text}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            )}
          </Match>
          <Match when={payload() !== undefined}>
            <JsonTree data={payload()} />
          </Match>
        </Switch>
      </div>
    </CardShell>
  )
}
