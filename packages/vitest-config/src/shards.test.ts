import {describe, expect, test} from 'vitest'
import {E2E_SHARD_SIZING, parseTimings, planShards, readPackagePart} from './shards.ts'

describe('the CI shard plan', () => {
  test('splits a package heavier than one shard into parts, one part per shard, and keeps light packages whole', () => {
    const plan = planShards(
      [
        {name: '@conciv/app', e2e: false},
        {name: '@conciv/chat', e2e: false},
        {name: '@conciv/protocol', e2e: false},
      ],
      {'@conciv/app': 600_000, '@conciv/chat': 20_000, '@conciv/protocol': 10_000},
    )
    const appParts = plan.map((shard) => shard.packages.filter((entry) => entry.startsWith('@conciv/app')))

    expect(appParts.flat().toSorted()).toEqual([
      '@conciv/app#1/4',
      '@conciv/app#2/4',
      '@conciv/app#3/4',
      '@conciv/app#4/4',
    ])
    expect(appParts.every((parts) => parts.length <= 1)).toBe(true)
    expect(
      plan
        .flatMap((shard) => shard.packages)
        .filter((entry) => !entry.startsWith('@conciv/app'))
        .toSorted(),
    ).toEqual(['@conciv/chat', '@conciv/protocol'])
  })

  test('never gives one shard two parts of a package, even when the package alone wants more parts than there are shards', () => {
    const plan = planShards(
      [{name: '@conciv/app', e2e: false}],
      {'@conciv/app': 600_000},
      {
        targetMs: 100_000,
        overheadMs: 0,
        minShards: 1,
        maxShards: 3,
        bootstrapShards: 1,
        splitHeavy: true,
      },
    )

    expect(plan.map((shard) => shard.packages)).toEqual([['@conciv/app#1/3'], ['@conciv/app#2/3'], ['@conciv/app#3/3']])
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
    expect(readPackagePart('@conciv/app#2/4')).toEqual({name: '@conciv/app', part: {index: 2, count: 4}})
    expect(readPackagePart('@conciv/app')).toEqual({name: '@conciv/app', part: null})
    expect(readPackagePart('@conciv/app#x')).toEqual({name: '@conciv/app', part: null})
  })
})
