import type {RawFrame, SourceLoc} from '@conciv/protocol'
import type {SnapdomPlugin} from '@zumer/snapdom'
import {Contract, Registry, type Json} from './core.js'
import type {Grab, GrabFrame} from './grab.js'

export type {RawFrame, SourceLoc}

export type Owner = {component: string; ref: string}

export type LocateResult = {
  component: string | null
  stack: string[]
  frames: RawFrame[]
  owners: Owner[]

  source?: SourceLoc
}

export type PageToastTone = 'info' | 'success' | 'error'

export interface PageCapture {
  readonly exclude: string
  readonly plugins: readonly SnapdomPlugin[]
}

export interface Page {
  symbolicate(input: {readonly frames: readonly GrabFrame[]}): Promise<SourceLoc | null>
  toast(message: string, tone?: PageToastTone): void
  readonly capture: PageCapture
  pick(): Promise<Grab | null>
}

export const Page = Contract.define<Page, 'conciv.page'>('conciv.page')

export interface PageOperation {
  readonly name: string
  run(input: Json, signal: AbortSignal): Promise<Json>
}

export const PageOperation = Registry.define<PageOperation>('page.operation')

export interface BrowserTabUrl {
  readonly redact: (href: string) => string
}

export const BrowserTabUrl = Registry.define<BrowserTabUrl>('browser-tab.url')

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

export const ReactTree = Contract.define<ReactTree, 'conciv.page.react'>('conciv.page.react')
