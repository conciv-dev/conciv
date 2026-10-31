import {makeEventListener} from '@solid-primitives/event-listener'
import {MODES, type Mode} from './stage.js'

export type ShortcutActions = {
  step: (by: number) => void
  mode: (mode: Mode) => void
  boxes: () => void
  run: () => void
  open: () => void
  fit: () => void
  zoom: (direction: 1 | -1) => void
  help: () => void
}

export const SHORTCUT_HELP: [string, string][] = [
  ['J / K', 'Next or previous component'],
  ['1-5', 'Live, design, diff, side by side, slider'],
  ['B', 'Component boxes'],
  ['R', 'Run the diff'],
  ['↵', 'Open the component in the editor'],
  ['0', 'Fit to view'],
  ['= / -', 'Zoom in or out'],
  ['?', 'This list'],
]

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
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

export function createShortcuts(actions: ShortcutActions): void {
  const keys: Record<string, (event: KeyboardEvent) => void> = {
    j: () => actions.step(1),
    k: () => actions.step(-1),
    b: () => actions.boxes(),
    r: () => actions.run(),
    '0': () => actions.fit(),
    '=': () => actions.zoom(1),
    '+': () => actions.zoom(1),
    '-': () => actions.zoom(-1),
    '?': () => actions.help(),
    Enter: (event) => {
      if (bodyOnly(event)) actions.open()
    },
  }
  const modes = Object.fromEntries(MODES.map((mode, index) => [String(index + 1), () => actions.mode(mode)]))
  const handlers: Record<string, (event: KeyboardEvent) => void> = {...modes, ...keys}
  makeEventListener(window, 'keydown', (event) => {
    if (ignored(event)) return
    handlers[event.key.length === 1 ? event.key.toLowerCase() : event.key]?.(event)
  })
}
