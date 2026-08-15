import {type StageSize, tipUnderTransform} from './mascot-stage.js'

const LAUNCH_JUMP_PX = 10

const DIGIT_COUNT = 5

export type Launch = {top: number; tipY: number}

export const stepsBetween = (values: readonly number[]): number[] =>
  values.slice(1).map((value, index) => value - (values[index] ?? 0))

export const launchFrames = (tops: readonly number[]): number[] =>
  stepsBetween(tops)
    .map((step, index) => (step > LAUNCH_JUMP_PX ? index + 1 : -1))
    .filter((index) => index >= 0)

export const RISE_PX_PER_ANTENNA_REFERENCE = -54

export const RISE_DURATION_S = 2.2

export const REFERENCE_ANTENNA_PX = 44

export const FRAMES_PER_SECOND = 60

export const risePerFrame = (antennaPx: number): number =>
  (RISE_PX_PER_ANTENNA_REFERENCE * (antennaPx / REFERENCE_ANTENNA_PX)) / RISE_DURATION_S / FRAMES_PER_SECOND

export function collectLaunches(frames: readonly number[][], stage: StageSize): Launch[] {
  const column = (index: number): number[] => frames.map((frame) => frame[index] ?? Number.NaN)
  const scaleY = column(DIGIT_COUNT)
  const yPercent = column(DIGIT_COUNT + 1)
  const digitTops = Array.from({length: DIGIT_COUNT}, (_, digit) => column(digit))
  return digitTops.flatMap((tops) =>
    launchFrames(tops).map((frame) => ({
      top: tops[frame] ?? Number.NaN,
      tipY: tipUnderTransform(stage, scaleY[frame] ?? Number.NaN, yPercent[frame] ?? Number.NaN).y,
    })),
  )
}
