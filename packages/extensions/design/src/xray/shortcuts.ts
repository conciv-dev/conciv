import {makeEventListener} from '@solid-primitives/event-listener'
import {MODES, type Mode} from './stage.js'
import type {View} from './xray-schemas.js'

export type ShortcutActions = {
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

function ignored(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || busyTarget(event.target)
}

function bodyOnly(event: KeyboardEvent): boolean {
  return event.target === document.body || event.target === document.documentElement
}

function expandedRow(event: KeyboardEvent): boolean {
  return event.target instanceof HTMLButtonElement && event.target.getAttribute('aria-expanded') === 'true'
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
