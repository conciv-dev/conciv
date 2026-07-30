import {For, Match, Show, Switch, type JSX} from 'solid-js'
import type {TranscriptTailEntry} from '@conciv/contract'

export const ASSISTANT_MARK = '●'
export const TOOL_MARK = '⏺'
export const RESULT_MARK = '⎿'
export const THINKING_MARK = '✳'
export const PROMPT_MARK = '>'

export const PREVIEW_CHARS = 72

const BOX =
  'flex flex-col gap-0.5 rounded-pw-sm bg-pw-sunken border border-pw-line-soft p-2 overflow-hidden font-mono text-[0.6875rem] leading-tight pointer-events-none select-none'
const LINE = 'flex items-baseline gap-1.5 min-w-0 w-full'
const TEXT = 'truncate min-w-0'
const DIM = 'text-pw-text-3'
const REPLY = 'text-pw-text-hi'
const TOOL = 'text-pw-warn'
const THINKING = 'text-pw-agent italic'
const INDENT = 'pl-3'
const PROMPT_BOX = 'mt-1.5 flex items-center gap-1.5 rounded-pw-sm border border-pw-line-soft px-1.5 py-1'
const CURSOR = 'inline-block w-1 h-3 bg-pw-text-3 shrink-0'

function clip(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= PREVIEW_CHARS ? flat : `${flat.slice(0, PREVIEW_CHARS - 1)}…`
}

function TailLine(props: {mark: string; text: string; tone: string; indent?: boolean}): JSX.Element {
  return (
    <span class={props.indent === true ? `${LINE} ${INDENT} ${props.tone}` : `${LINE} ${props.tone}`}>
      <span class="shrink-0">{props.mark}</span>
      <span class={TEXT}>{props.text}</span>
    </span>
  )
}

function TailEntry(props: {entry: TranscriptTailEntry}): JSX.Element {
  return (
    <Switch>
      <Match when={props.entry.role === 'user'}>
        <TailLine mark={PROMPT_MARK} text={clip(props.entry.text)} tone={DIM} />
      </Match>
      <Match when={props.entry.role === 'assistant'}>
        <TailLine mark={ASSISTANT_MARK} text={clip(props.entry.text)} tone={REPLY} />
      </Match>
      <Match when={props.entry.role === 'tool'}>
        <TailLine mark={TOOL_MARK} text={clip(props.entry.toolName ?? 'tool')} tone={TOOL} />
        <Show when={props.entry.toolResult}>
          {(result) => <TailLine mark={RESULT_MARK} text={clip(result())} tone={DIM} indent />}
        </Show>
      </Match>
    </Switch>
  )
}

export function TranscriptTailPreview(props: {tail: TranscriptTailEntry[]; working: boolean}): JSX.Element {
  return (
    <div class={BOX} aria-hidden="true">
      <For each={props.tail}>{(entry) => <TailEntry entry={entry} />}</For>
      <Show when={props.working}>
        <TailLine mark={THINKING_MARK} text="Thinking…" tone={THINKING} />
      </Show>
      <span class={PROMPT_BOX}>
        <span class={DIM}>{PROMPT_MARK}</span>
        <Show when={props.working}>
          <span class={CURSOR} />
        </Show>
      </span>
    </div>
  )
}
