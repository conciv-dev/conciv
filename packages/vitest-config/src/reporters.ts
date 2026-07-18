import type {TestUserConfig} from 'vitest/node'

type Reporters = NonNullable<TestUserConfig['reporters']>

export function ciReporters(): Reporters {
  if (!process.env.GITHUB_ACTIONS) return ['default']
  return ['default', ['github-actions', {jobSummary: {enabled: false}}], ['json', {outputFile: 'test-results.json'}]]
}
