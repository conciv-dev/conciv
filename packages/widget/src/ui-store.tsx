// The reactive keyed UI store the widget renders for extension ui.setWidget/setHeader/setFooter/
// setStatus. Module-level signals (one widget instance per page); slot components render them inside
// the chat panel, each behind an error boundary so one bad factory can't crash the widget.
import {createSignal, ErrorBoundary, For, Show, type JSX} from 'solid-js'
import type {UiFactory} from '@mandarax/extensions'

type Keyed<T> = {key: string; value: T}

const upsert = <T,>(list: Keyed<T>[], key: string, value: T | null): Keyed<T>[] => {
  const without = list.filter((e) => e.key !== key)
  return value === null ? without : [...without, {key, value}]
}

const [widgets, setWidgets] = createSignal<Keyed<UiFactory>[]>([])
const [statuses, setStatuses] = createSignal<Keyed<string>[]>([])
const [header, setHeader] = createSignal<UiFactory | null>(null)
const [footer, setFooter] = createSignal<UiFactory | null>(null)

export const setExtWidget = (key: string, factory: UiFactory | null): void => {
  setWidgets((prev) => upsert(prev, key, factory))
}
export const setExtStatus = (key: string, text: string | null): void => {
  setStatuses((prev) => upsert(prev, key, text))
}
export const setExtHeader = (factory: UiFactory | null): void => {
  setHeader(() => factory)
}
export const setExtFooter = (factory: UiFactory | null): void => {
  setFooter(() => factory)
}

function Slot(props: {factory: UiFactory | null}): JSX.Element {
  return <Show when={props.factory}>{(f) => <ErrorBoundary fallback={null}>{f()()}</ErrorBoundary>}</Show>
}

export const ExtHeaderSlot = (): JSX.Element => <Slot factory={header()} />
export const ExtFooterSlot = (): JSX.Element => <Slot factory={footer()} />

export function ExtWidgetsSlot(): JSX.Element {
  return (
    <For each={widgets()}>
      {(w) => (
        <div data-pw-ext-widget={w.key}>
          <ErrorBoundary fallback={null}>{w.value()}</ErrorBoundary>
        </div>
      )}
    </For>
  )
}

export function ExtStatusSlot(): JSX.Element {
  return (
    <Show when={statuses().length > 0}>
      <div class="text-[0.75rem] text-pw-text-2 leading-[1.4] font-medium font-pw mx-3 mb-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <For each={statuses()}>{(s) => <span data-pw-ext-status={s.key}>{s.value}</span>}</For>
      </div>
    </Show>
  )
}
