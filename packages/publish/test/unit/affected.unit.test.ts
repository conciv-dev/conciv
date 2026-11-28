import {describe, expect, test} from 'vitest'
import {
  type AffectedProbe,
  readDryRunPackages,
  readTurboVersion,
  renderPlanSummary,
  selectAffected,
} from '../../src/affected.ts'

describe('the CI affected plan', () => {
  const pullRequest = {name: 'pull_request', baseSha: 'base000000000000', headSha: 'head000000000000'}

  function failing(message: string): () => never {
    return () => {
      throw new Error(message)
    }
  }

  function probe(changedFiles: string[], overrides: Partial<AffectedProbe> = {}): AffectedProbe {
    return {
      mergeBase: () => 'merge0000000000000',
      changedFiles: () => changedFiles,
      affectedPackages: () => ['@conciv/types', 'conciv-storybook'],
      ...overrides,
    }
  }

  test.for([
    ['a main push', {...pullRequest, name: 'push'}, probe(['packages/types/src/index.ts']), /push run/],
    ['a missing head SHA', {...pullRequest, headSha: undefined}, probe([]), /head SHA is missing/],
    [
      'a missing base ref',
      pullRequest,
      probe([], {mergeBase: failing('fatal: Not a valid commit name base')}),
      /base ref is missing \(fatal: Not a valid commit name base\)/,
    ],
    ['a workflow change', pullRequest, probe(['.github/workflows/ci.yml']), /\.github\/workflows\/ci\.yml changed/],
    ['a lockfile change', pullRequest, probe(['docs/a.md', 'pnpm-lock.yaml']), /pnpm-lock\.yaml changed/],
    ['a planner change', pullRequest, probe(['packages/publish/src/ci-shards.ts']), /ci-shards\.ts changed/],
    [
      'a failed turbo query',
      pullRequest,
      probe(['packages/types/src/index.ts'], {affectedPackages: failing('turbo exited 1')}),
      /turbo --affected query failed \(turbo exited 1\)/,
    ],
  ] as const)('runs everything on %s, and says why', ([, event, given, reason]) => {
    const selection = selectAffected(event, given)

    expect(selection.packages).toBeNull()
    expect(selection.reason).toMatch(reason)
  })

  test('selects what turbo reports affected on a pull request, reads turbo from the lockfile, and writes the summary', () => {
    const selection = selectAffected(pullRequest, probe(['packages/types/src/index.ts', 'packages/types/package.json']))

    expect(selection).toEqual({
      packages: ['@conciv/types', 'conciv-storybook'],
      reason: 'turbo --affected since the merge base merge0000000',
    })
    expect(readDryRunPackages(JSON.stringify({packages: ['//', '@conciv/types'], tasks: []}))).toEqual([
      '@conciv/types',
    ])
    expect(() => readDryRunPackages('{"tasks": []}')).toThrow(/no \.packages array/)
    expect(readTurboVersion('packages:\n\n  turbo-darwin-arm64@2.11.10:\n  turbo@2.11.10:\n    resolution: {}\n')).toBe(
      '2.11.10',
    )
    expect(renderPlanSummary('Package tests', selection, ['@conciv/types'], 40)).toBe(
      '### Package tests plan\n\n1 of 40 packages run, 39 skipped: turbo --affected since the merge base merge0000000.\n\n- @conciv/types\n\n',
    )
  })
})
