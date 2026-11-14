import type {LocateResult, RawFrame, SourceLoc} from '@conciv/protocol/page-introspect-types'
import {Contract, Registry} from './core.js'
import type {GrabFrame} from './grab.js'

export type PageToastTone = 'info' | 'success' | 'error'

export interface PageCapture {
  readonly exclude: string
}

export interface Page {
  symbolicate(input: {readonly frames: readonly GrabFrame[]}): Promise<SourceLoc | null>
  toast(message: string, tone?: PageToastTone): void
  readonly capture: PageCapture
}

export const Page = Contract.define<Page, 'page'>('page')

export type DehydrateOptions = {
  maxDepth?: number
  maxItems?: number
  stringCap?: number
  maxNodes?: number

  redact?: RegExp | null
}

export interface ReactFiber {
  readonly memoizedProps?: unknown
  readonly child?: ReactFiber | null
  readonly sibling?: ReactFiber | null
}

export interface ReactComponentInfo {
  readonly component: string
  readonly file: string | null
}

export interface ReactTree {
  rootFibers(): readonly ReactFiber[]
  dehydrate(value: unknown, options?: DehydrateOptions): unknown
  describe(element: Element): ReactComponentInfo
  locate(element: Element): Promise<LocateResult | null>
  frames(element: Element): Promise<readonly RawFrame[]>
}

export const ReactTree = Contract.define<ReactTree, 'page.react'>('page.react')

export interface PageEffect {
  readonly name: string
  readonly description: string
  set(enabled: boolean): void
  enabled(): boolean
}

export const PageEffect = Registry.define<PageEffect>('page.effect')
