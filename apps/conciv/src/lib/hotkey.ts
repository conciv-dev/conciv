import {parseHotkey, type RawHotkey} from '@tanstack/hotkeys'

export function toRawHotkey(binding: string): RawHotkey {
  const parsed = parseHotkey(binding)
  return {key: parsed.key, ctrl: parsed.ctrl, shift: parsed.shift, alt: parsed.alt, meta: parsed.meta}
}
