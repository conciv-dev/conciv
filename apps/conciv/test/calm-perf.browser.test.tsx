import '../src/styles.css'
import 'virtual:uno.css'
import {expect, test} from 'vitest'
import {
  glideToLatestFromFarUp,
  registerCalmCore,
  startBoundaryRun,
  startMultiToolRun,
  streamCodeAnswer,
  type CalmWatch,
} from './helpers.browser.js'

const FRAME_P95_BUDGET_MS = 20
const FRAME_JANK_BUDGET = 2
const MIN_SAMPLED_WINDOW_MS = 300

registerCalmCore('calm-perf')

function expectSmooth(watch: CalmWatch): void {
  const gaps = watch.frameGaps()
  expect(gaps.sampledMs).toBeGreaterThanOrEqual(MIN_SAMPLED_WINDOW_MS)
  expect(gaps.p95).toBeLessThanOrEqual(FRAME_P95_BUDGET_MS)
  expect(gaps.over33).toBeLessThanOrEqual(FRAME_JANK_BUDGET)
}

test('a multi-tool run streams without dropped frames', async () => {
  expectSmooth(await startMultiToolRun())
})

test('a long thread at the virtualization boundary streams a run without dropped frames', async () => {
  expectSmooth(await startBoundaryRun())
}, 120_000)

test('a streamed code block streams without dropped frames', async () => {
  expectSmooth(await streamCodeAnswer())
}, 120_000)

test('Latest from far up in a long chat glides to the end without dropped frames', async () => {
  const watch = await glideToLatestFromFarUp()
  console.info('latest glide frame gaps', JSON.stringify(watch.frameGaps()))
  expectSmooth(watch)
}, 120_000)
