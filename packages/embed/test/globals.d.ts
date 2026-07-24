import type {ConcivHandle} from '../src/mount.js'

declare global {
  interface Window {
    ConcivHandle: {makeHandle: (apiBase: string) => ConcivHandle}
    concivTestHandle: ConcivHandle
    concivTestElement: HTMLElement
  }
}
