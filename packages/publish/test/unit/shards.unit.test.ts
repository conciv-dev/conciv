import {describe, expect, test} from 'vitest'
import {E2E_SHARD_SIZING, parseTimings, planShards, readPackagePart} from '../../src/shards.ts'

describe('the CI shard plan', () => {
  test('splits a package heavier than one shard into parts, one part per shard, and keeps light packages whole', () => {
    const plan = planShards(
      [
        {name: '@internal/frontend-defaults', e2e: false},
        {name: '@conciv/backend-defaults', e2e: false},
        {name: '@conciv/types', e2e: false},
      ],
      {'@internal/frontend-defaults': 600_000, '@conciv/backend-defaults': 20_000, '@conciv/types': 10_000},
    )
    const appParts = plan.map((shard) =>
      shard.packages.filter((entry) => entry.startsWith('@internal/frontend-defaults')),
    )

    expect(appParts.flat().toSorted()).toEqual([
      '@internal/frontend-defaults#1/4',
      '@internal/frontend-defaults#2/4',
      '@internal/frontend-defaults#3/4',
      '@internal/frontend-defaults#4/4',
    ])
    expect(appParts.every((parts) => parts.length <= 1)).toBe(true)
    expect(
      plan
        .flatMap((shard) => shard.packages)
        .filter((entry) => !entry.startsWith('@internal/frontend-defaults'))
        .toSorted(),
    ).toEqual(['@conciv/backend-defaults', '@conciv/types'])
  })

  test('never gives one shard two parts of a package, even when the package alone wants more parts than there are shards', () => {
    const plan = planShards(
      [{name: '@internal/frontend-defaults', e2e: false}],
      {'@internal/frontend-defaults': 600_000},
      {
        targetMs: 100_000,
        overheadMs: 0,
        minShards: 1,
        maxShards: 3,
        bootstrapShards: 1,
        splitHeavy: true,
      },
    )

    expect(plan.map((shard) => shard.packages)).toEqual([
      ['@internal/frontend-defaults#1/3'],
      ['@internal/frontend-defaults#2/3'],
      ['@internal/frontend-defaults#3/3'],
    ])
  })

  test('keeps an e2e app whole however heavy it is, weighing a multi-project app by the sum of its playwright projects', () => {
    const plan = planShards([{name: 'conciv-e2e-next', e2e: true}], {'conciv-e2e-next': 3_000_000}, E2E_SHARD_SIZING)

    expect(plan.flatMap((shard) => shard.packages)).toEqual(['conciv-e2e-next'])

    const timings = parseTimings(
      JSON.stringify({
        'conciv-e2e-vite-react (chromium)': 100_000,
        'conciv-e2e-vite-react (firefox-storage-refused)': 13_000,
        'conciv-e2e-astro': 7_000,
        'conciv-e2e-init': -1,
      }),
    )
    expect(timings).toEqual({'conciv-e2e-vite-react': 113_000, 'conciv-e2e-astro': 7_000})
  })

  test('reads a planned entry as a part only when it ends in index/count, and anything else as the whole package', () => {
    expect(readPackagePart('@internal/frontend-defaults#2/4')).toEqual({
      name: '@internal/frontend-defaults',
      part: {index: 2, count: 4},
    })
    expect(readPackagePart('@internal/frontend-defaults')).toEqual({name: '@internal/frontend-defaults', part: null})
    expect(readPackagePart('@internal/frontend-defaults#x')).toEqual({name: '@internal/frontend-defaults', part: null})
  })
})
