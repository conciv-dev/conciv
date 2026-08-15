import type * as MascotModule from '../src/rig.js'
import type {DigitPlacement, StagePlacement, StageParts, StagePoint} from './e2e/helpers/mascot-stage.js'

type Summary = {min: number; max: number; last: number}

type Anchor = {left: number; top: number}

type LayoutReads = {computedStyle: number; offset: number; rect: number}

type EmitterGeometry = {fontSizePx: number; leadingLeft: number; trailingLeft: number; top: number}

type EmitterFlight = {
  launchLeft: number
  stageWidth: number
  antennaPx: number
  fontSizePx: number
  leadingLeft: number
  top: number
  rise: number[]
}

type EffectTotals = {starts: number; stops: number; removes: number; rests: number; live: number}

type ScrollStageParts = StageParts & {scroller: HTMLElement}

type MascotHarness = {
  mascot: typeof MascotModule
  buildStage: (sizePx?: number, layerInsetPx?: number, placement?: StagePlacement) => StageParts
  buildBareStage: (sizePx?: number) => HTMLElement
  buildScrollStage: (sizePx?: number) => ScrollStageParts
  applyStyle: (element: HTMLElement, style: Record<string, string>) => HTMLElement
  leanWrappers: () => HTMLElement[]
  emitters: () => HTMLElement[]
  requireEmitter: () => HTMLElement
  requireLeanWrapper: () => HTMLElement
  requireDigit: (emitter: HTMLElement, index: number) => HTMLElement
  requireCanvas: (host: HTMLElement) => HTMLCanvasElement
  canvasSignature: (canvas: HTMLCanvasElement) => number
  canvasInk: (canvas: HTMLCanvasElement) => number
  tickerListenerCount: () => number
  pendingFrameCount: () => number
  settleFrames: () => Promise<number>
  loadEffect: (name: string, exportName: string) => Promise<MascotModule.EffectMount>
  emitterGeometry: (emitter: HTMLElement) => EmitterGeometry
  emitterFlight: (parts: StageParts, seconds: number) => EmitterFlight
  curvedDigitPlacement: (emitter: HTMLElement, index: number) => DigitPlacement
  countingEffect: MascotModule.EffectMount
  countingEffectTotals: () => EffectTotals
  failingEffect: MascotModule.EffectMount
  layoutReads: () => LayoutReads
  transformOriginOf: (element: HTMLElement) => string
  wait: (milliseconds: number) => Promise<void>
  nextFrame: () => Promise<number>
  sampleFrames: <T>(read: () => T, milliseconds: number) => Promise<T[]>
  installManualClock: () => void
  advanceTo: (seconds: number) => void
  advanceBy: (seconds: number) => void
  stepFrames: <T>(read: () => T, seconds: number) => T[]
  summarize: (values: readonly number[]) => Summary
  reversals: (values: readonly number[], deadband: number) => number
  waitUntil: (predicate: () => boolean, milliseconds: number) => Promise<boolean>
  property: (element: Element | null, name: string) => number
  stageCenter: (root: HTMLElement) => StagePoint
  watchResize: () => void
  awaitResize: () => Promise<void>
  globalTweenCount: () => number
  activeWritersOf: (element: HTMLElement) => number
  activeWritersOfProperty: (element: HTMLElement, property: string) => number
  boxOf: (element: HTMLElement) => Anchor
  anchorOf: (element: HTMLElement) => Anchor
  digitFlightOf: (emitter: HTMLElement, index: number) => Anchor
  repeatingTimeline: () => object | undefined
}

declare global {
  interface Window {
    mascotHarness: MascotHarness
    parts: StageParts
    rig: MascotModule.FabRobotRig
    service: MascotModule.MascotService
    readonly pointerMoveListenerCount: number
    readonly pendingFrameLoopCount: number
    readonly layoutReads?: LayoutReads
  }
}
