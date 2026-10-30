import {For, Show, type JSX} from 'solid-js'
import {Button, ClipboardCopyButton, Collapsible} from '@conciv/ui-kit-system'
import type {Box} from '../shared/types.js'
import type {Delta, Row} from './data.js'
import {fixPrompt, traced} from './fix-prompt.js'
import {Kbd} from './kbd.js'
import {percent} from './rail.js'

const HEADING = 'm-0 text-[0.6875rem] font-normal uppercase tracking-wider text-chat-text-3'
const TRIGGER = `${HEADING} flex w-full items-center justify-between cursor-pointer py-1 focus-ring rounded-chat-surface-sm`
const CODE =
  'm-0 whitespace-pre-wrap [overflow-wrap:anywhere] rounded-chat-surface-sm bg-chat-sunken px-2 py-1.5 font-chat-mono text-[0.75rem] leading-normal text-chat-text'

function boxText(box: Box | null): string {
  if (box === null) return 'none'
  return `${box.x}, ${box.y} · ${box.w}×${box.h}`
}

function Section(props: {title: string; children: JSX.Element}): JSX.Element {
  return (
    <Collapsible.Root defaultOpen class="flex flex-col gap-2">
      <Collapsible.Trigger class={TRIGGER}>
        {props.title}
        <Collapsible.Indicator class="transition-transform data-[state=open]:rotate-90 motion-reduce:transition-none">
          ›
        </Collapsible.Indicator>
      </Collapsible.Trigger>
      <Collapsible.Content>
        <div class="pt-1 flex flex-col gap-2">{props.children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

function DeltaCard(props: {delta: Delta}): JSX.Element {
  return (
    <div class="text-[0.75rem] px-2.5 py-2 border border-chat-line rounded-chat-surface-md bg-chat-fill flex gap-2 items-center">
      <span class="text-chat-text-hi font-semibold">{props.delta.kind}</span>
      <span class="text-chat-text-2 font-chat-mono ml-auto tabular-nums">
        {props.delta.live} → <b class="text-chat-danger font-medium">{props.delta.target}</b>
      </span>
    </div>
  )
}

function where(delta: Delta): string {
  return [delta.file, delta.line, delta.column].filter((part) => part !== undefined).join(':')
}

function unmatchedNote(row: Row): string {
  if (row.unmatched === 'extra')
    return 'The target has nothing under this box; the live tree renders an element the design does not have.'
  return 'The target has an element here that the live page does not render.'
}

export function Inspector(props: {row: Row | null; onOpen: () => void; opening: boolean}): JSX.Element {
  return (
    <section
      aria-label="component"
      class="px-4 py-3.5 overscroll-contain flex flex-col gap-3.5 min-h-0 overflow-y-auto"
    >
      <Show when={props.row} fallback={<p class="text-[0.75rem] text-chat-text-3 m-0">Select a component.</p>}>
        {(row) => {
          const traces = () => row().deltas.filter(traced)
          const prompt = () => fixPrompt(row())
          return (
            <>
              <div class="flex flex-col">
                <h2 class={HEADING}>Component</h2>
                <div class="flex gap-2 items-center">
                  <span class="text-[0.8125rem] text-chat-text-hi font-chat-mono flex-1 min-w-0 truncate">
                    {row().label}
                  </span>
                  <Show when={row().source}>
                    <Button variant="outline" size="sm" disabled={props.opening} onClick={() => props.onOpen()}>
                      Open <Kbd>↵</Kbd>
                    </Button>
                  </Show>
                </div>
                <Show when={row().tag !== ''}>
                  <span class="text-[0.75rem] text-chat-text-2 font-chat-mono [overflow-wrap:anywhere]">
                    &lt;{row().tag}&gt; {row().selector}
                  </span>
                </Show>
              </div>
              <dl class="text-[0.75rem] m-0 gap-x-3 gap-y-1 grid grid-cols-[auto_1fr]">
                <dt class="text-chat-text-3">live box</dt>
                <dd class="text-chat-text-2 font-chat-mono m-0">{boxText(row().live)}</dd>
                <dt class="text-chat-text-3">target box</dt>
                <dd class="text-chat-text-2 font-chat-mono m-0">{boxText(row().target)}</dd>
                <Show when={row().mismatch !== null}>
                  <dt class="text-chat-text-3">mismatch</dt>
                  <dd class="text-chat-text-2 font-chat-mono m-0">{percent(row().mismatch ?? 0)} of its tile</dd>
                </Show>
              </dl>
              <Section title="Deltas">
                <Show when={row().unmatched !== null}>
                  <p class="text-[0.75rem] text-chat-text-2 m-0">{unmatchedNote(row())}</p>
                </Show>
                <Show when={row().unmatched === null && row().deltas.length === 0}>
                  <p class="text-[0.75rem] text-chat-text-3 m-0">No delta above tolerance (2px, ΔE 3).</p>
                </Show>
                <For each={row().deltas}>{(delta) => <DeltaCard delta={delta} />}</For>
              </Section>
              <Show when={traces().some((delta) => delta.declaration !== undefined)}>
                <Section title="Declaration">
                  <For each={traces().filter((delta) => delta.declaration !== undefined)}>
                    {(delta) => (
                      <code class={CODE}>
                        {delta.selector === undefined
                          ? delta.declaration
                          : `${delta.selector} { ${delta.declaration} }`}
                      </code>
                    )}
                  </For>
                </Section>
              </Show>
              <Show when={traces().length > 0}>
                <Section title="Source">
                  <For each={traces()}>
                    {(delta) => (
                      <div class="text-[0.75rem] flex flex-col gap-1">
                        <span class="text-chat-text-2 flex flex-wrap gap-1.5 items-center">
                          via
                          <span class="text-[0.625rem] text-chat-text font-chat-mono px-1.5 border border-chat-accent-line rounded-chat-pill bg-chat-accent-08">
                            {delta.via}
                          </span>
                          <span class="font-chat-mono min-w-0 [overflow-wrap:anywhere]">{where(delta)}</span>
                        </span>
                        <Show when={delta.suggest}>
                          {(suggest) => <span class="text-chat-text-2">{suggest()}</span>}
                        </Show>
                      </div>
                    )}
                  </For>
                </Section>
              </Show>
              <Show when={prompt()}>
                {(text) => (
                  <div class="text-[0.75rem] text-chat-text-2 flex gap-2 items-center">
                    <ClipboardCopyButton
                      text={text()}
                      tooltips={{idle: 'Copy as fix prompt', copied: 'Fix prompt copied'}}
                      variant="ghost"
                    />
                    Copy as fix prompt
                  </div>
                )}
              </Show>
            </>
          )
        }}
      </Show>
    </section>
  )
}
