import {
  BINARY_EMITTER_DIGIT_COUNT,
  BINARY_EMITTER_RISE_DURATION_S,
  BINARY_EMITTER_RISE_PX,
} from '../../../src/core/config.js'
import {robotSkin} from '../../../src/core/skin.js'
import {type StageSize, tipUnderTransform} from './mascot-stage.js'

const LAUNCH_JUMP_PX = 10

const FRAMES_PER_SECOND = 60

const LAUNCH_FRAME_COLUMNS = BINARY_EMITTER_DIGIT_COUNT + 2

export type Launch = {top: number; tipY: number}

export const stepsBetween = (values: readonly number[]): number[] =>
  values.slice(1).map((value, index) => value - (values[index] ?? 0))

export const launchFrames = (tops: readonly number[]): number[] =>
  stepsBetween(tops)
    .map((step, index) => (step > LAUNCH_JUMP_PX ? index + 1 : -1))
    .filter((index) => index >= 0)

export function medianStep(values: readonly number[]): number {
  const sorted = stepsBetween(values).toSorted((left, right) => left - right)
  if (sorted.length === 0) throw new Error('a median step needs at least two samples')
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN
}

export const risePerFrame = (antennaPx: number): number =>
  (BINARY_EMITTER_RISE_PX * (antennaPx / robotSkin.referenceAntennaPx)) /
  BINARY_EMITTER_RISE_DURATION_S /
  FRAMES_PER_SECOND

function requireLaunchFrames(frames: readonly number[][]): number[][] {
  const ragged = frames.find((frame) => frame.length !== LAUNCH_FRAME_COLUMNS)
  if (ragged === undefined) return frames.map((frame) => [...frame])
  throw new Error(
    `a launch frame carries ${LAUNCH_FRAME_COLUMNS} columns (${BINARY_EMITTER_DIGIT_COUNT} digit tops, scaleY, yPercent) but one carried ${ragged.length}`,
  )
}

export function collectLaunches(frames: readonly number[][], stage: StageSize): Launch[] {
  const rows = requireLaunchFrames(frames)
  const column = (index: number): number[] => rows.map((frame) => frame[index] ?? Number.NaN)
  const scaleY = column(BINARY_EMITTER_DIGIT_COUNT)
  const yPercent = column(BINARY_EMITTER_DIGIT_COUNT + 1)
  const digitTops = Array.from({length: BINARY_EMITTER_DIGIT_COUNT}, (_, digit) => column(digit))
  return digitTops.flatMap((tops) =>
    launchFrames(tops).map((frame) => ({
      top: tops[frame] ?? Number.NaN,
      tipY: tipUnderTransform(stage, scaleY[frame] ?? Number.NaN, yPercent[frame] ?? Number.NaN).y,
    })),
  )
}
