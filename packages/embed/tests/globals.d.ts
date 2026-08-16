import type {ConcivHandle} from '../src/mount.js'

declare global {
  interface Window {
    ConcivHandle: {
      makeHandle: (apiBase: string) => ConcivHandle
      makeConnectHandle: () => ConcivHandle
    }
    concivTestHandle: ConcivHandle
    concivTestElement: HTMLElement
    concivNativePost: (message: unknown) => Promise<void>
    concivNativeRebind: (detail: unknown) => Promise<void>
  }
  var __fabFrames: Promise<Array<{x: number; y: number; width: number; height: number}>>
}
