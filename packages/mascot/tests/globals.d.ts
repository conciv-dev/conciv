import type * as MascotModule from '../src/rig.js'
import type {StageParts, StagePoint} from './e2e/helpers/mascot-stage.js'

type Summary = {min: number; max: number; last: number}

type Anchor = {left: number; top: number}

type EmitterGeometry = {fontSizePx: number; leadingLeft: number; trailingLeft: number; top: number}

type MascotHarness = {
  mascot: typeof MascotModule
  buildStage: (sizePx?: number, layerInsetPx?: number) => StageParts
  buildBareStage: (sizePx?: number) => HTMLElement
  applyStyle: (element: HTMLElement, style: Record<string, string>) => HTMLElement
  leanWrappers: () => HTMLElement[]
  emitters: () => HTMLElement[]
  requireEmitter: () => HTMLElement
  requireLeanWrapper: () => HTMLElement
  requireDigit: (emitter: HTMLElement, index: number) => HTMLElement
  emitterGeometry: (emitter: HTMLElement) => EmitterGeometry
  wait: (milliseconds: number) => Promise<void>
  nextFrame: () => Promise<number>
  sampleFrames: <T>(read: () => T, milliseconds: number) => Promise<T[]>
  summarize: (values: readonly number[]) => Summary
  reversals: (values: readonly number[], deadband: number) => number
  waitUntil: (predicate: () => boolean, milliseconds: number) => Promise<boolean>
  property: (element: Element | null, name: string) => number
  stageCenter: (root: HTMLElement) => StagePoint
  globalTweenCount: () => number
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
