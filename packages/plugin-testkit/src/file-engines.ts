import {disposeAll} from './dispose.js'

export const fileEngines: Array<() => Promise<void>> = []

export function stopFileEngines(): Promise<void> {
  return disposeAll(fileEngines.splice(0), 'sequential', 'an engine made at file level did not stop cleanly')
}
