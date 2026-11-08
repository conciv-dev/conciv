import {normalizeHotkey, parseHotkey} from '@tanstack/hotkeys'
import {createHotkey} from '@tanstack/solid-hotkeys'
import {onCleanup} from 'solid-js'
import {createStore} from 'solid-js/store'
import type {HotkeyBinding, HotkeyRegistry} from '@conciv/extension/host'

export function createHotkeyRegistry(): HotkeyRegistry {
  const [held, setHeld] = createStore<HotkeyBinding[]>([])
  return {
    register: ({handler, ...entry}) => {
      const holder = held.find((existing) => sameBinding({left: existing.binding, right: entry.binding}))
      if (holder !== undefined) throw new Error(refusal({holder, entry}))
      setHeld(held.length, entry)
      createHotkey(parseHotkey(entry.binding), handler)
      onCleanup(() =>
        setHeld((listed) => listed.filter((existing) => !sameBinding({left: existing.binding, right: entry.binding}))),
      )
    },
    bindings: () => held,
  }
}

function sameBinding(input: {left: string; right: string}): boolean {
  return normalizeHotkey(input.left) === normalizeHotkey(input.right)
}

function refusal(input: {holder: HotkeyBinding; entry: HotkeyBinding}): string {
  const {holder, entry} = input
  return `${entry.binding} for ${entry.label} (${entry.owner}) is held by ${holder.label} (${holder.owner})`
}
