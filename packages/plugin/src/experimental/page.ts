import type {RawFrame, SourceLoc} from '@conciv/contract'
import type {SnapdomPlugin} from '@zumer/snapdom'
import {Contract} from './core.js'
import type {Grab, GrabFrame} from './grab.js'

export type {RawFrame, SourceLoc}
export {RawFrameSchema, SourceLocSchema} from '@conciv/contract'

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
