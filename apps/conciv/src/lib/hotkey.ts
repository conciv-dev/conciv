import {parseHotkey, type RawHotkeyChord} from '@tanstack/hotkeys'

export function toRawHotkey(binding: string): RawHotkeyChord {
  return parseHotkey(binding)
}
