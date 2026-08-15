import type * as MascotModule from '../src/rig.js'
import type {DigitPlacement, StagePlacement, StageParts, StagePoint} from './e2e/helpers/mascot-stage.js'

type Summary = {min: number; max: number; last: number}

type Anchor = {left: number; top: number}

type EmitterGeometry = {fontSizePx: number; leadingLeft: number; trailingLeft: number; top: number}

type EffectTotals = {starts: number; stops: number; removes: number; live: number}

type MascotHarness = {
  mascot: typeof MascotModule
  buildStage: (sizePx?: number, layerInsetPx?: number, placement?: StagePlacement) => StageParts
  buildBareStage: (sizePx?: number) => HTMLElement
  applyStyle: (element: HTMLElement, style: Record<string, string>) => HTMLElement
  leanWrappers: () => HTMLElement[]
  emitters: () => HTMLElement[]
  requireEmitter: () => HTMLElement
  requireLeanWrapper: () => HTMLElement
  requireDigit: (emitter: HTMLElement, index: number) => HTMLElement
  emitterGeometry: (emitter: HTMLElement) => EmitterGeometry
  curvedDigitPlacement: (emitter: HTMLElement, index: number) => DigitPlacement
  countingEffect: MascotModule.EffectMount
  countingEffectTotals: () => EffectTotals
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
  globalTweenCount: () => number
  activeWritersOf: (element: HTMLElement) => number
  boxOf: (element: HTMLElement) => Anchor
  anchorOf: (element: HTMLElement) => Anchor
  repeatingTimeline: () => object | undefined
}

declare global {
  interface Window {
    mascotHarness: MascotHarness
    parts: StageParts
    rig: MascotModule.FabRobotRig
    service: MascotModule.MascotService
    readonly pointerMoveListenerCount: number
  }
}
