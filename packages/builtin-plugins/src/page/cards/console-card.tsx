import {For, Match, Show, Switch, type JSX} from 'solid-js'
import {z} from 'zod'
import type {ToolProps} from '@conciv/plugin/experimental'
import {DANGER_TEXT_CLASS, JsonTree} from '@conciv/ui-kit-chat/tools'
import {PageValueChip} from './page-result-views.js'
import {pageOperation} from './page-tool-names.js'
import {LIST_ROW_CLASS, PageTool, QUIET_TEXT_CLASS, countLabel, outputPayload} from './shared.js'

const ConsolePayload = pageOperation('console').output

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', second: '2-digit'})

const LIST =
  'm-0 p-0 list-none block w-full max-h-[13.75rem] overflow-auto rounded-[var(--chat-radius-sm)] text-[length:var(--chat-text-xs)] [background:var(--chat-sunken)] [border:1px_solid_var(--chat-line-soft)]'
const LEVEL = 'text-[length:var(--chat-text-xs)] flex-none w-10 uppercase [font-family:var(--chat-mono)]'
const LEVEL_QUIET = `${LEVEL} text-chat-text-3`
const LEVEL_DANGER = `${LEVEL} text-chat-danger`
const TIME = 'text-[length:var(--chat-text-xs)] flex-none text-chat-text-3 [font-family:var(--chat-mono)] tabular-nums'
const TEXT =
  'text-[length:var(--chat-text-sm)] flex-1 min-w-0 whitespace-pre-wrap [color:var(--chat-text)] [font-family:var(--chat-mono)] [overflow-wrap:anywhere]'
const TEXT_DANGER = `${DANGER_TEXT_CLASS} flex-1 min-w-0 [overflow-wrap:anywhere]`

const ERROR_LEVELS: ReadonlySet<string> = new Set(['error', 'uncaught', 'unhandled'])

type ConsoleLine = z.output<typeof ConsolePayload>['entries'][number]

function readLines(payload: unknown): readonly ConsoleLine[] | undefined {
  const parsed = ConsolePayload.safeParse(payload)
  return parsed.success ? parsed.data.entries : undefined
}

function lineLabel(count: number): string {
  return countLabel(count, 'line', 'lines')
}

function isErrorLevel(level: string): boolean {
  return ERROR_LEVELS.has(level)
}

function pickTextClass(level: string): string {
  return isErrorLevel(level) ? TEXT_DANGER : TEXT
}

function pickLevelClass(level: string): string {
  return isErrorLevel(level) ? LEVEL_DANGER : LEVEL_QUIET
}

export function ConsoleCard(props: ToolProps): JSX.Element {
  const payload = () => outputPayload(props.output)
  const lines = () => readLines(payload())
  const failed = () => (lines() ?? []).some((entry) => isErrorLevel(entry.level))
  return (
    <PageTool {...props} failed={failed()} hasContent={payload() !== undefined}>
      <div class="flex flex-col gap-1.5">
        <Switch>
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
                        <span class={pickLevelClass(entry.level)}>{entry.level}</span>
                        <span class={pickTextClass(entry.level)}>{entry.text}</span>
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
    </PageTool>
  )
}
