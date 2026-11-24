import type {RawFrame, SourceLoc} from '@conciv/contract'
import {Contract, Registry, type Json} from '@conciv/plugin/experimental'

export type Owner = {component: string; ref: string}

export type LocateResult = {
  component: string | null
  stack: string[]
  frames: RawFrame[]
  owners: Owner[]

  source?: SourceLoc
}

export interface PageOperation {
  readonly name: string
  run(input: Json, signal: AbortSignal): Promise<Json>
}

export const PageOperation = Registry.define<PageOperation>('page.operation')

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

export const ReactTree = Contract.define<ReactTree, '@conciv/plugin-page.react'>('@conciv/plugin-page.react')
