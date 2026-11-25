type CiReporterEntry = 'default' | ['github-actions', {jobSummary: {enabled: boolean}}] | ['json', {outputFile: string}]

export function ciReporters(): CiReporterEntry[] {
  if (!process.env.GITHUB_ACTIONS) return ['default']
  return ['default', ['github-actions', {jobSummary: {enabled: false}}], ['json', {outputFile: 'test-results.json'}]]
}

export const TANSTACK_AI_SOLID_DEPS = [
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/byok',
  '@conciv/ai > @tanstack/ai-solid > @tanstack/ai-client/devtools',
]

export function browserOptimizeDeps(alsoInclude: string[] = []): {
  include: string[]
} {
  return {
    include: alsoInclude,
  }
}
