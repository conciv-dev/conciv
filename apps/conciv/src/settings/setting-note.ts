import {createContext} from 'solid-js'

export const SettingNote = createContext<(key: string) => string | undefined>(() => undefined)
