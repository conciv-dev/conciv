import {For, Show, type Component, type JSX} from 'solid-js'
import {createStore} from 'solid-js/store'
import {Dynamic} from 'solid-js/web'
import {CheckboxPrimitive as Checkbox} from '@conciv/ui-kit-system'
import type {AnyFieldApi} from '@tanstack/solid-form'
import {difference, isEqual, without} from 'es-toolkit'
import Check from 'lucide-solid/icons/check'
import GripVertical from 'lucide-solid/icons/grip-vertical'
import Pin from 'lucide-solid/icons/pin'
import AppWindow from 'lucide-solid/icons/app-window'
import {orderViews} from './arrange-views.js'

type SettingsView = {id: string; label: string; badge?: string; icon?: Component<{class?: string}>}

const ROW =
  'flex items-center gap-2.5 min-h-11 py-1.5 pe-1.5 ps-1 bg-chat-fill-soft data-[dragging]:opacity-50 data-[drop]:[box-shadow:inset_0_2px_0_var(--chat-accent)]'
const GRIP =
  'grid place-items-center w-4.5 h-7 shrink-0 p-0 bg-transparent [border:none] text-chat-dim cursor-grab focus-ring rounded-[var(--chat-radius-chip)] disabled:cursor-default disabled:opacity-0'
const CHECK_ROOT = 'flex flex-1 min-w-0 items-center gap-2.5 cursor-pointer select-none data-[disabled]:cursor-default'
const CHECK_CONTROL =
  'grid place-items-center shrink-0 size-3.75 rounded-[0.1875rem] [border:1px_solid_var(--chat-line-2)] text-chat-on-accent trans-cbb data-[state=checked]:bg-chat-accent data-[state=checked]:[border-color:var(--chat-accent)] data-[focus-visible]:[outline:0.125rem_solid_var(--chat-accent)] data-[focus-visible]:[outline-offset:0.125rem] data-[disabled]:opacity-60'
const ICON = 'size-3.75 shrink-0 text-chat-text-2'
const NAME =
  'flex flex-1 min-w-0 overflow-hidden items-center gap-2 text-[0.8125rem] font-medium text-chat-text-hi group-data-[off]:text-chat-dim'
const BADGE =
  'min-w-0 truncate ms-0.5 py-px px-1.25 rounded-[var(--chat-radius-chip)] [border:1px_solid_var(--chat-line-2)] font-chat-mono text-[0.5625rem] font-normal uppercase tracking-[0.1em] text-chat-text-2'
const PIN =
  'grid place-items-center size-8 shrink-0 rounded-[var(--chat-radius-sm)] bg-transparent [border:none] text-chat-text-2 cursor-pointer focus-ring trans-bg hover:bg-chat-fill-strong hover:text-chat-text-hi aria-pressed:text-chat-accent disabled:cursor-default disabled:hover:bg-transparent'

type ViewRowProps = {
  view: SettingsView
  shown: boolean
  pinned: boolean
  fixed?: boolean
  dragging?: boolean
  drop?: boolean
  onShownChange?: (shown: boolean) => void
  onPinnedChange?: (pinned: boolean) => void
  onMove?: (step: -1 | 1) => void
  onDragStart?: () => void
  onDragEnd?: () => void
  onDragOver?: () => void
  onDrop?: () => void
}

export function ViewRow(props: ViewRowProps): JSX.Element {
  let grip: HTMLButtonElement | undefined
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.altKey || !props.onMove) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    props.onMove(event.key === 'ArrowUp' ? -1 : 1)
    grip?.focus()
  }
  return (
    <div
      class={`group ${ROW}`}
      data-off={props.shown ? undefined : ''}
      data-dragging={props.dragging ? '' : undefined}
      data-drop={props.drop ? '' : undefined}
      draggable={!props.fixed}
      onKeyDown={onKeyDown}
      onDragStart={(event) => {
        event.dataTransfer?.setData('text/plain', props.view.id)
        props.onDragStart?.()
      }}
      onDragEnd={() => props.onDragEnd?.()}
      onDragOver={(event) => {
        if (props.fixed) return
        event.preventDefault()
        props.onDragOver?.()
      }}
      onDrop={(event) => {
        event.preventDefault()
        props.onDrop?.()
      }}
    >
      <button
        ref={(element) => {
          grip = element
        }}
        type="button"
        class={GRIP}
        disabled={props.fixed}
        aria-label={`Reorder ${props.view.label}`}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      >
        <GripVertical class="size-3.5" aria-hidden="true" />
      </button>
      <Checkbox.Root
        class={CHECK_ROOT}
        checked={props.shown}
        disabled={props.fixed}
        onCheckedChange={(details) => props.onShownChange?.(details.checked === true)}
      >
        <Checkbox.Control class={CHECK_CONTROL}>
          <Checkbox.Indicator>
            <Check class="size-2.75" stroke-width={3} aria-hidden="true" />
          </Checkbox.Indicator>
        </Checkbox.Control>
        <Dynamic component={props.view.icon ?? AppWindow} class={ICON} aria-hidden="true" />
        <Checkbox.Label class={NAME}>
          {props.view.label}
          <Show when={props.view.badge}>{(badge) => <span class={BADGE}>{badge()}</span>}</Show>
        </Checkbox.Label>
        <Checkbox.HiddenInput />
      </Checkbox.Root>
      <button
        type="button"
        class={PIN}
        aria-pressed={props.pinned}
        disabled={props.fixed}
        aria-label={`Pin ${props.view.label}`}
        onClick={() => props.onPinnedChange?.(!props.pinned)}
      >
        <Pin class="size-3.5" aria-hidden="true" />
      </button>
    </div>
  )
}

type ViewsListProps = {
  views: readonly SettingsView[]
  hidden: AnyFieldApi
  pinned: AnyFieldApi
  order: AnyFieldApi
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function orderRecord(value: unknown): Record<string, number> {
  if (typeof value !== 'object' || value === null) return {}
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number'),
  )
}

export function ViewsList(props: ViewsListProps): JSX.Element {
  const [drag, setDrag] = createStore<{from?: string; over?: string}>({})
  const hidden = () => stringList(props.hidden.state.value)
  const pinned = () => stringList(props.pinned.state.value)
  const ordered = () =>
    orderViews(props.views, {docksPinned: pinned(), docksCustomOrder: orderRecord(props.order.state.value)})
  const place = (id: string, target: number) => {
    const ids = ordered().map((view) => view.id)
    const from = ids.indexOf(id)
    if (from < 0 || target < 0 || target >= ids.length || from === target) return
    const next = without(ids, id)
    next.splice(target, 0, id)
    const natural = orderViews(props.views, {docksPinned: pinned(), docksCustomOrder: {}}).map((view) => view.id)
    props.order.handleChange(
      isEqual(next, natural) ? {} : Object.fromEntries(next.map((viewId, index) => [viewId, index])),
    )
  }
  const findViewIndex = (id: string) => ordered().findIndex((view) => view.id === id)
  const toggle = (field: AnyFieldApi, list: string[], id: string, on: boolean) =>
    field.handleChange(on ? [...difference(list, [id]), id] : without(list, id))
  return (
    <For each={ordered()}>
      {(view) => (
        <ViewRow
          view={view}
          shown={!hidden().includes(view.id)}
          pinned={pinned().includes(view.id)}
          dragging={drag.from === view.id}
          drop={drag.over === view.id && drag.from !== view.id}
          onShownChange={(shown) => toggle(props.hidden, hidden(), view.id, !shown)}
          onPinnedChange={(on) => toggle(props.pinned, pinned(), view.id, on)}
          onMove={(step) => place(view.id, findViewIndex(view.id) + step)}
          onDragStart={() => setDrag({from: view.id, over: undefined})}
          onDragOver={() => setDrag('over', view.id)}
          onDragEnd={() => setDrag({from: undefined, over: undefined})}
          onDrop={() => {
            if (drag.from) place(drag.from, findViewIndex(view.id))
            setDrag({from: undefined, over: undefined})
          }}
        />
      )}
    </For>
  )
}
