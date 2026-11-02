import {makeEventListener} from '@solid-primitives/event-listener'
import {Show, type JSX} from 'solid-js'
import {RelativeTime} from '@conciv/ui-kit-system'
import {RunButton} from './panel.js'
import type {Filter, View} from './panel.js'
import {MODES, type Mode} from './stage.js'

type ShortcutActions = {
  capture: () => boolean
  step: (by: number) => void
  view: (view: View) => void
  mode: (mode: Mode) => void
  boxes: () => void
  run: () => void
  open: () => void
  copy: () => void
  fit: () => void
  zoom: (direction: 1 | -1) => void
  help: () => void
}

export const SHORTCUT_HELP: [string, string][] = [
  ['J / K', 'Next or previous component'],
  ['↵', 'Open the component in the editor'],
  ['C', 'Copy the fix prompt'],
  ['R', 'Run the diff'],
  ['1 / 2', 'List or capture'],
  ['3-7', 'Live, design, diff, side by side, slider (capture)'],
  ['B', 'Component boxes (capture)'],
  ['0', 'Fit to view (capture)'],
  ['= / -', 'Zoom in or out (capture)'],
  ['?', 'This list'],
]

const MODE_KEY_START = 3

const NON_TEXT_INPUTS = new Set(['radio', 'checkbox', 'button', 'submit', 'reset', 'range'])

function typing(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type)) ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

const OVERLAY_SELECTOR = '[role=dialog], [role=listbox]'

function insideOverlay(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(OVERLAY_SELECTOR) !== null
}

function busyTarget(target: EventTarget | null): boolean {
  return typing(target) || insideOverlay(target)
}

function origin(event: KeyboardEvent): EventTarget | null {
  return event.composedPath()[0] ?? event.target
}

function ignored(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || busyTarget(origin(event))
}

function bodyOnly(event: KeyboardEvent): boolean {
  const target = origin(event)
  return target === document.body || target === document.documentElement
}

function expandedRow(event: KeyboardEvent): boolean {
  const target = origin(event)
  return target instanceof HTMLButtonElement && target.getAttribute('aria-expanded') === 'true'
}

export function createShortcuts(actions: ShortcutActions): void {
  const inCapture = (action: () => void) => () => {
    if (actions.capture()) action()
  }
  const keys: Record<string, (event: KeyboardEvent) => void> = {
    j: () => actions.step(1),
    k: () => actions.step(-1),
    c: () => actions.copy(),
    r: () => actions.run(),
    '1': () => actions.view('list'),
    '2': () => actions.view('capture'),
    b: inCapture(() => actions.boxes()),
    '0': inCapture(() => actions.fit()),
    '=': inCapture(() => actions.zoom(1)),
    '+': inCapture(() => actions.zoom(1)),
    '-': inCapture(() => actions.zoom(-1)),
    '?': () => actions.help(),
    Enter: (event) => {
      if (!bodyOnly(event) && !expandedRow(event)) return
      event.preventDefault()
      actions.open()
    },
  }
  const modes = Object.fromEntries(
    MODES.map((mode, index) => [String(index + MODE_KEY_START), inCapture(() => actions.mode(mode))]),
  )
  const handlers: Record<string, (event: KeyboardEvent) => void> = {...modes, ...keys}
  makeEventListener(window, 'keydown', (event) => {
    if (ignored(event)) return
    handlers[event.key.length === 1 ? event.key.toLowerCase() : event.key]?.(event)
  })
}

const PLURAL = new Intl.PluralRules(undefined)

function components(total: number): string {
  return `${total} ${PLURAL.select(total) === 'one' ? 'component' : 'components'}`
}

function EmptyState(props: {icon: string; title: JSX.Element; children?: JSX.Element}): JSX.Element {
  return (
    <div class="px-4 flex-1 grid place-items-center">
      <div class="text-center flex flex-col gap-3 items-center">
        <span class={`${props.icon} text-4xl op-fade`} aria-hidden="true" />
        <h2 class="text-lg font-medium m-0 text-balance">{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

export function Loading(): JSX.Element {
  return (
    <div role="status" class="flex-1 grid place-items-center">
      <span class="op-fade flex gap-2 items-center">
        <span class="i-ph-circle-notch animate-spin motion-reduce:animate-none" aria-hidden="true" />
        Loading the x-ray…
      </span>
    </div>
  )
}

export function LoadError(props: {message: string; onRetry: () => void}): JSX.Element {
  return (
    <div role="alert" class="flex flex-1 flex-col">
      <EmptyState icon="i-ph-warning-duotone" title="The x-ray could not load this target">
        <p class="text-sm font-mono m-0 op-fade max-w-160 break-all text-pretty">{props.message}</p>
        <button type="button" class="btn-action-sm" onClick={() => props.onRetry()}>
          <span class="i-ph-arrow-clockwise-duotone" aria-hidden="true" />
          Retry
        </button>
      </EmptyState>
    </div>
  )
}

export function NoTarget(): JSX.Element {
  return (
    <EmptyState icon="i-ph-image-duotone" title="No design target in this session">
      <p class="text-sm m-0 op-fade max-w-80 text-pretty">
        Ask the agent to match this page to a design image; it registers the image with design_target.
      </p>
    </EmptyState>
  )
}

export function NoRun(props: {route?: string; width: number; running: boolean; onRun: () => void}): JSX.Element {
  return (
    <EmptyState
      icon="i-ph-image-duotone"
      title={
        <>
          No diff for <span class="font-mono">{props.route}</span> at {props.width}
        </>
      }
    >
      <p class="text-sm m-0 op-fade">Run the diff to compare the live page with the design.</p>
      <RunButton primary running={props.running} onRun={props.onRun} />
    </EmptyState>
  )
}

export function AllMatch(props: {
  width: number
  total: number
  ranAt: number | null
  stale: boolean
  running: boolean
  onRun: () => void
}): JSX.Element {
  return (
    <EmptyState
      icon="i-ph-check-circle-duotone text-green-600 dark:text-green-400"
      title={`Matches the design at ${props.width}`}
    >
      <p class="text-sm m-0 op-fade tabular-nums">
        {components(props.total)}, 0 properties off
        <Show when={props.ranAt}>
          {(at) => (
            <>
              {' · diffed '}
              <RelativeTime value={new Date(at())} />
            </>
          )}
        </Show>
      </p>
      <Show when={props.stale}>
        <RunButton running={props.running} onRun={props.onRun} />
      </Show>
    </EmptyState>
  )
}

export function NothingShown(props: {query: string; filter: Filter; onClear: () => void}): JSX.Element {
  const text = () => {
    if (props.filter === 'none') return 'Nothing selected. Turn on Off.'
    return props.query.trim() === ''
      ? 'No component in this selection.'
      : `No component matches “${props.query.trim()}”.`
  }
  return (
    <div class="flex-1 grid place-items-center">
      <div class="flex flex-col gap-3 items-center">
        <p class="text-sm m-0 text-center op-fade">{text()}</p>
        <Show when={props.query.trim() !== ''}>
          <button type="button" class="btn-action-sm" onClick={() => props.onClear()}>
            <span class="i-ph-x-circle-duotone" aria-hidden="true" />
            Clear search
          </button>
        </Show>
      </div>
    </div>
  )
}
