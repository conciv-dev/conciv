import {createContext} from 'solid-js'

export const SettingNote = createContext<(key: string, entry?: string) => string | undefined>(() => undefined)
