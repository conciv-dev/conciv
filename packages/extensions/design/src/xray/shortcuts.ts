import {makeEventListener} from '@solid-primitives/event-listener'
import {MODES, type Mode} from './stage.js'

export type ShortcutActions = {
  step: (by: number) => void
  mode: (mode: Mode) => void
  boxes: () => void
  rulers: () => void
  run: () => void
  open: () => void
  flip: () => void
  help: () => void
}

export const SHORTCUT_HELP: [string, string][] = [
  ['J / K', 'next / previous component'],
  ['1 – 5', '2-up, swipe, onion, toggle, diff'],
  ['← / →', 'live or target, in toggle'],
  ['B', 'component boxes'],
  ['D', 'redline rulers'],
  ['R', 'run the diff'],
  ['↵', 'open the component in the editor'],
  ['?', 'this list'],
]

function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

function ignored(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)
}

function bodyOnly(event: KeyboardEvent): boolean {
  return event.target === document.body || event.target === document.documentElement
}

export function createShortcuts(actions: ShortcutActions): void {
  const keys: Record<string, (event: KeyboardEvent) => void> = {
    j: () => actions.step(1),
    k: () => actions.step(-1),
    b: () => actions.boxes(),
    d: () => actions.rulers(),
    r: () => actions.run(),
    '?': () => actions.help(),
    Enter: (event) => {
      if (bodyOnly(event)) actions.open()
    },
    ArrowLeft: (event) => {
      if (bodyOnly(event)) actions.flip()
    },
    ArrowRight: (event) => {
      if (bodyOnly(event)) actions.flip()
    },
  }
  const modes = Object.fromEntries(MODES.map((mode, index) => [String(index + 1), () => actions.mode(mode)]))
  const handlers: Record<string, (event: KeyboardEvent) => void> = {...keys, ...modes}
  makeEventListener(window, 'keydown', (event) => {
    if (ignored(event)) return
    handlers[event.key.length === 1 ? event.key.toLowerCase() : event.key]?.(event)
  })
}
