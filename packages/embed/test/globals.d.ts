import type {ConcivHandle} from '../src/mount.js'

declare global {
  interface Window {
    ConcivHandle: {makeHandle: (apiBase: string) => ConcivHandle}
    concivTestHandle: ConcivHandle
    concivTestElement: HTMLElement
    __p2n: unknown[]
    __rebinds: {apiBase?: string}[]
    concivNativePost: (message: unknown) => Promise<void>
    concivNativeRebind: (detail: unknown) => Promise<void>
  }
}
