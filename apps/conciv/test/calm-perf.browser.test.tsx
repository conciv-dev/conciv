import '../src/styles.css'
import 'virtual:uno.css'
import {expect, test} from 'vitest'
import {commands, server} from 'vitest/browser'
import {
  glideToLatestFromFarUp,
  registerCalmCore,
  sampleCalmRuns,
  startBoundaryRun,
  startMultiToolRun,
  streamCodeAnswer,
  type FrameGaps,
} from './helpers.browser.js'

const FRAME_P95_BUDGET_MS = 20
const FRAME_JANK_BUDGET = 2
const MIN_SAMPLED_WINDOW_MS = 300
const PERF_SAMPLES = 5
const PERF_MAIN_TOLERANCE_MS = 1.5
const SAMPLED_CASE_TIMEOUT_MS = 300_000

registerCalmCore('calm-perf')

function medianP95(samples: ReadonlyArray<FrameGaps>): number {
  const sorted = samples.map((gaps) => gaps.p95).toSorted((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? 0
  return ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

async function readP95Limit(scenario: string): Promise<{limit: number; against: string}> {
  const baseline = await commands.perfBaseline()
  if (baseline === null) {
    console.warn(`perf ${server.browser} ${scenario}: no baseline: judged against the fixed budget only`)
    return {limit: FRAME_P95_BUDGET_MS, against: 'no baseline'}
  }
  const main = baseline[server.browser]?.[scenario]
  if (main === undefined) throw new Error(`the perf baseline has no median for ${scenario} in ${server.browser}`)
  return {limit: Math.max(FRAME_P95_BUDGET_MS, main + PERF_MAIN_TOLERANCE_MS), against: `main ${main}`}
}

function describeSample(gaps: FrameGaps): string {
  return `${gaps.p50}/${gaps.p95}/${gaps.max}/${gaps.over33}/${gaps.sampledMs}ms`
}

async function expectSmooth(scenario: string, samples: ReadonlyArray<FrameGaps>): Promise<void> {
  const median = medianP95(samples)
  await commands.recordPerfMedian(server.browser, scenario, median)
  const {limit, against} = await readP95Limit(scenario)
  const verdict = median <= limit ? 'PASS' : 'FAIL'
  console.info(
    `PERF ${server.browser} ${scenario} ${verdict} median p95 ${median} (${against}, limit ${limit}) samples p50/p95/max/over33/sampled: ${samples.map(describeSample).join(' | ')}`,
  )
  for (const gaps of samples) {
    expect(gaps.sampledMs).toBeGreaterThanOrEqual(MIN_SAMPLED_WINDOW_MS)
    expect(gaps.over33).toBeLessThanOrEqual(FRAME_JANK_BUDGET)
  }
  expect(median).toBeLessThanOrEqual(limit)
}

test(
  'a multi-tool run streams without dropped frames',
  async () => {
    await expectSmooth('multi-tool', await sampleCalmRuns(PERF_SAMPLES, startMultiToolRun))
  },
  SAMPLED_CASE_TIMEOUT_MS,
)

test(
  'a long thread at the virtualization boundary streams a run without dropped frames',
  async () => {
    await expectSmooth('virtual-boundary', await sampleCalmRuns(PERF_SAMPLES, startBoundaryRun))
  },
  SAMPLED_CASE_TIMEOUT_MS,
)

test(
  'a streamed code block streams without dropped frames',
  async () => {
    await expectSmooth('code-block', await sampleCalmRuns(PERF_SAMPLES, streamCodeAnswer))
  },
  SAMPLED_CASE_TIMEOUT_MS,
)

test(
  'Latest from far up in a long chat glides to the end without dropped frames',
  async () => {
    await expectSmooth('glide', await sampleCalmRuns(PERF_SAMPLES, glideToLatestFromFarUp))
  },
  SAMPLED_CASE_TIMEOUT_MS,
)
